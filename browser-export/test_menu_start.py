"""メインメニューから別タブでB10を開き、模擬Excelを保存するテスト。"""
import asyncio
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.async_api import async_playwright
from test_store_search import HTML, SOURCE

REPORT = '''<header>地区別売上 期間：2026/10/01～2026/10/17
店舗：0589 テスト店舗</header><button id="excel">Excel出力</button>
<script>
document.querySelector('#excel').onclick=()=>{
 const a=document.createElement('a');
 a.href=URL.createObjectURL(new Blob(['synthetic export']));
 a.download='district-sales.xlsm';a.click();
};
</script>'''

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for mode in ['spa', 'full-navigation', 'delayed-stores', 'popup-blocked']:
   context=await browser.new_context(accept_downloads=True)
   alerts=[]
   downloads=[]
   opened=[]
   async def dialog(d):
    if d.type=='prompt': await d.accept(d.default_value)
    else: alerts.append(d.message);await d.accept()
   def on_page(page):
    opened.append(page)
    page.on('dialog',dialog)
    page.on('download',lambda d:downloads.append(d))
   context.on('page',on_page)
   async def route_request(route):
    url=urlsplit(route.request.url)
    if url.path=='/fsbi/MenuPage/MenuPage':
     body='<main>Fourseeds 分析帳票 メインメニュー</main>'
    elif url.path=='/fsbi/RPTS00/recover':
     assert parse_qs(url.query)=={'linkRpt':['B10R01']}
     # 実際の画面と同じDOM構造。社内データやアカウントは使わない。
     action="location.href='/fsbi/test-report'" if mode=='full-navigation' else '''document.body.innerHTML=`<header>地区別売上 期間：2026/10/01～2026/10/17 店舗：0589 テスト店舗</header><button id="excel">Excel出力</button>`;
document.querySelector('#excel').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['synthetic export']));a.download='district-sales.xlsm';a.click();};'''
     body=HTML+'''<script>
setTimeout(()=>{document.querySelector('tbody').innerHTML='<tr rowid="0589"><td><span class="vxe-cell--radio is--checked">○</span></td><td><span class="vxe-cell--label">0589</span></td></tr>';},'''+('600' if mode=='delayed-stores' else '0')+''');
document.querySelector('#run').onclick=()=>{'''+action+''' };
</script>'''
    elif url.path=='/fsbi/test-report': body=REPORT
    else: raise AssertionError('Unexpected request: '+url.path)
    await route.fulfill(body='<!doctype html><meta charset="utf-8">'+body,content_type='text/html; charset=utf-8')
   await context.route('**/*',route_request)
   menu=await context.new_page()
   await menu.goto('http://in-bi.four-seeds.jp/fsbi/MenuPage/MenuPage')
   if mode=='popup-blocked':await menu.evaluate('window.open=()=>null')
   await asyncio.wait_for(menu.evaluate(SOURCE), timeout=55)
   if mode=='popup-blocked':
    assert len(opened)==1 and not downloads and len(alerts)==1
    assert 'ポップアップ' in alerts[0]
   else:
    for _ in range(40):
     if downloads:break
     await asyncio.sleep(0.1)
    assert len(opened)==2 and len(downloads)==1,(mode,alerts)
    assert not alerts,(mode,alerts)
    assert downloads[0].suggested_filename=='district-sales.xlsm'
    downloaded_path=await downloads[0].path()
    assert Path(downloaded_path).read_bytes()==b'synthetic export'
   assert menu.url.endswith('/fsbi/MenuPage/MenuPage')
   assert await menu.evaluate('window.__b10ExportRunning') is False
   print(mode, 'PASS', 'downloads:',len(downloads))
   await context.close()
  await browser.close()

if __name__ == '__main__':
 asyncio.run(main())
