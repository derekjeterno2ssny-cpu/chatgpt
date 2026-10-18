"""B119の月次指定と、年越しを含む前月指定をブラウザー上で確認。"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
from test_store_search import HTML
SOURCE=Path(__file__).with_name('food-selection.js').read_text()
FOOD_HTML=HTML.replace('B10：地区別売上','B119：食材理論値').replace('月指定','月次').replace('10月','9月')
async def check(page, request, missing=False):
 await page.evaluate('''(missing)=>{
  window.runs=0;
  const row=document.createElement('tr');row.setAttribute('rowid',missing?'0573':'0589');
  row.innerHTML='<td><span class="vxe-cell--radio">○</span></td><td><span class="vxe-cell--label">'+(missing?'0573':'0589')+'</span></td>';
  row.querySelector('.vxe-cell--radio').onclick=()=>row.querySelector('.vxe-cell--radio').classList.add('is--checked');
  document.querySelector('tbody').appendChild(row);
  document.querySelector('#run').onclick=()=>window.runs++;
  for(const select of document.querySelectorAll('.ant-select'))select.querySelector('[role=combobox]').onclick=()=>{
   for(const text of ['2025年','2026年','9月','12月']){
    const option=document.createElement('div');option.className='ant-select-dropdown-menu-item';option.textContent=text;
    option.onclick=()=>{select.querySelector('.ant-select-selection-selected-value').textContent=text;document.querySelectorAll('.ant-select-dropdown-menu-item').forEach(e=>e.remove());};
    document.body.appendChild(option);
   }
  };
 }''',missing)
 return await page.evaluate('(async request=>{'+SOURCE+';const result=await prepareFoodReport(window,request);result.run.click();return result.target;})',request)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for name,request,expected in [
   ('previous-month',{'year':2026,'month':10,'store':'0589'},{'year':2026,'month':9,'store':'0589'}),
   ('previous-year',{'year':2026,'month':1,'store':'589'},{'year':2025,'month':12,'store':'0589'}),
   ('missing-store',{'year':2026,'month':10,'store':'0589'},None),
  ]:
   page=await browser.new_page()
   await page.route('**/*',lambda route:route.fulfill(body=FOOD_HTML,content_type='text/html; charset=utf-8'))
   await page.goto('http://in-bi.four-seeds.jp/fsbi/RPTB119/initialize?linkRpt=B119R01')
   if expected:
    actual=await check(page,request)
    assert actual==expected,(name,actual)
    assert await page.evaluate('window.runs')==1
   else:
    try:await check(page,request,missing=True)
    except Exception as error:assert '一覧に見つかりません' in str(error)
    else:raise AssertionError('Missing store was accepted')
    assert await page.evaluate('window.runs')==0
   print(name,'PASS')
   await page.close()
  await browser.close()
if __name__=='__main__':asyncio.run(main())
