"""会社サイトに接続せず、メインメニューから2帳票の保存まで確認。"""
import asyncio,calendar,json
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.async_api import async_playwright
from test_store_search import HTML
from test_food_selection import FOOD_HTML
SOURCE=Path(__file__).with_name('combined-export.js').read_text()
def report(kind,year,month,store,delay=0):
 title='地区別売上' if kind=='district' else '食材理論値'
 end=calendar.monthrange(year,month)[1]
 name=f'{kind}-{year}-{month:02}-{store}.xlsm'
 return f'''<header>{title} 期間:{year}/{month:02}/01～{year}/{month:02}/{end:02} 店舗:{store} テスト店舗</header><footer><button id="excel">Excel出力</button></footer><script>
 document.querySelector('#excel').onclick=()=>setTimeout(()=>{{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([{json.dumps(name)}]));a.download={json.dumps(name)};a.click();}},{delay});</script>'''
def selection(kind,mode):
 body=HTML if kind=='district' else FOOD_HTML
 setup='''<script>
 document.querySelector('tbody').innerHTML='<tr rowid="0589"><td><span class="vxe-cell--radio is--checked">○</span></td><td><span class="vxe-cell--label">0589</span></td></tr>';
 for(const select of document.querySelectorAll('.ant-select'))select.querySelector('[role=combobox]').onclick=()=>{
  for(const text of ['2025年','2026年',...Array.from({length:12},(_,i)=>(i+1)+'月')]){
   const option=document.createElement('div');option.className='ant-select-dropdown-menu-item';option.textContent=text;
   option.onclick=()=>{select.querySelector('.ant-select-selection-selected-value').textContent=text;document.querySelectorAll('.ant-select-dropdown-menu-item').forEach(e=>e.remove());};document.body.appendChild(option);
  }
 };
 document.querySelector('#run').onclick=()=>{
  const values=[...document.querySelectorAll('.ant-select-selection-selected-value')].map(e=>parseInt(e.textContent));
  location.href='/fsbi/test-'''+kind+'''?year='+values[0]+'&month='+values[1]+'&store=0589';
 };
 </script>'''
 return body+setup
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for mode,month in [('two-exports',10),('year-boundary',1),('delayed-first-download',10),('reject-wrong-district-store',10),('reject-wrong-food-store',10),('reject-wrong-food-month',10)]:
   context=await browser.new_context(accept_downloads=True)
   downloads=[];alerts=[];food_requests=[]
   async def dialog(d):
    if d.type=='prompt':await d.accept(str(month) if '対象月' in d.message else d.default_value)
    else:alerts.append(d.message);await d.accept()
   def on_page(page):
    page.on('dialog',dialog);page.on('download',lambda d:downloads.append(d))
   context.on('page',on_page)
   async def route_request(route):
    u=urlsplit(route.request.url);q=parse_qs(u.query)
    if u.path=='/fsbi/MenuPage/MenuPage':body='<main>分析帳票 メインメニュー</main>'
    elif u.path=='/fsbi/RPTS00/recover':body=selection('district',mode)
    elif u.path=='/fsbi/RPTB119/initialize':
     assert q=={'linkRpt':['B119R01']};body=selection('food',mode)
    elif u.path.startswith('/fsbi/test-'):
     kind=u.path.removeprefix('/fsbi/test-');year=int(q['year'][0]);m=int(q['month'][0]);store=q['store'][0]
     if kind=='district' and mode=='reject-wrong-district-store':store='0573'
     if kind=='food':
      food_requests.append((year,m,store))
      if mode=='reject-wrong-food-store':store='0573'
      if mode=='reject-wrong-food-month':m=10
     body=report(kind,year,m,store,2000 if kind=='district' and mode=='delayed-first-download' else 0)
    else:raise AssertionError('Unexpected path: '+u.path)
    await route.fulfill(body='<!doctype html><meta charset="utf-8">'+body,content_type='text/html; charset=utf-8')
   await context.route('**/*',route_request)
   menu=await context.new_page();await menu.goto('http://in-bi.four-seeds.jp/fsbi/MenuPage/MenuPage')
   await asyncio.wait_for(menu.evaluate(SOURCE),timeout=15)
   expected_food=(2025,12,'0589') if month==1 else (2026,9,'0589')
   if mode=='reject-wrong-district-store':
    assert not food_requests and not downloads and len(alerts)==1
    assert await menu.locator('iframe').count()==0
    assert await menu.evaluate('window.__fsbiCombinedExportRunning') is False
    print(mode,'PASS: no food report or downloads')
    await context.close()
    continue
   assert food_requests==[expected_food],(mode,food_requests)
   rejected=mode.startswith('reject-')
   for _ in range(80):
    if len(downloads)==(1 if rejected else 2):break
    await asyncio.sleep(.1)
   names=sorted(d.suggested_filename for d in downloads)
   expected=[f'district-2026-{month:02}-0589.xlsm']
   if not rejected:expected.append(f'food-{expected_food[0]}-{expected_food[1]:02}-0589.xlsm')
   assert names==sorted(expected),(mode,names,alerts)
   for d in downloads:assert Path(await d.path()).read_text()==d.suggested_filename
   assert bool(alerts)==rejected,(mode,alerts)
   assert await menu.evaluate('window.__fsbiCombinedExportRunning') is False
   assert menu.url.endswith('/fsbi/MenuPage/MenuPage')
   print(mode,'PASS',names)
   await context.close()
  await browser.close()
if __name__=='__main__':asyncio.run(main())
