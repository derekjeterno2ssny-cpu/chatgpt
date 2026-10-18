import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
SOURCE=Path(__file__).with_name('export.js').read_text()
HTML='''<!doctype html><meta charset="utf-8"><main>B10：地区別売上
<div class="ant-radio-group"><label class="ant-radio-wrapper ant-radio-wrapper-checked">月指定</label></div>
<div class="ant-select"><div role="combobox"><div class="ant-select-selection-selected-value">2026年</div></div></div>
<div class="ant-select"><div role="combobox"><div class="ant-select-selection-selected-value">10月</div></div></div>
<label class="ant-radio-wrapper ant-radio-wrapper-checked">日付あわせ</label>
<div class="vxe-table"><div class="vxe-table--body-wrapper" style="height:120px;overflow:auto;position:relative"><div class="spacer"></div><table style="position:absolute;top:0;left:0"><tbody></tbody></table></div></div>
<button id="run">実 行</button></main>'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for name,options in [('virtual-offscreen',{}),('search-from-bottom',{'bottom':True}),('unpadded-code',{'fallback':True}),('absent-store',{'absent':True}),('wrong-result-store',{'wrong':True})]:
   page=await browser.new_page()
   await page.route('**/*',lambda route:route.fulfill(body=HTML,content_type='text/html; charset=utf-8'))
   await page.goto('http://in-bi.four-seeds.jp/fsbi/RPTS00/recover')
   await page.evaluate('''(opts)=>{
    window.exports=0;window.runs=0;window.selected='';window.scrolls=0;
    const wrapper=document.querySelector('.vxe-table--body-wrapper');
    wrapper.querySelector('.spacer').style.height='3000px';
    const tbody=wrapper.querySelector('tbody');
    function render(){
     const first=Math.floor(wrapper.scrollTop/30);
     tbody.innerHTML='';wrapper.querySelector('table').style.top=(first*30)+'px';
     for(let i=first;i<Math.min(100,first+6);i++){
      const code=String(500+i).padStart(4,'0');
      if(opts.absent && code==='0589')continue;
      const tr=document.createElement('tr');tr.setAttribute('rowid',opts.fallback?'generated-'+i:code);
      tr.style.height='30px';
      tr.innerHTML='<td><span class="vxe-cell--radio '+(window.selected===code?'is--checked':'')+'">○</span></td><td><span class="vxe-cell--label">'+(opts.fallback?String(Number(code)):code)+'</span></td>';
      tr.querySelector('.vxe-cell--radio').onclick=()=>{window.selected=code;render();};
      tbody.appendChild(tr);
     }
    }
    wrapper.addEventListener('scroll',()=>{window.scrolls++;render();});
    if(opts.bottom)wrapper.scrollTop=2800;
    render();
    document.querySelector('#run').onclick=()=>{
     window.runs++;
     document.body.innerHTML='<header>地区別売上 期間：2026/10/01～2026/10/17 店舗：'+(opts.wrong?'0573':window.selected)+' テスト店舗</header><button id="excel">Excel出力</button>';
     document.querySelector('#excel').onclick=()=>window.exports++;
    };
   }''',options)
   alerts=[]
   async def dialog(d):
    if d.type=='prompt':await d.accept(d.default_value)
    else:alerts.append(d.message);await d.accept()
   page.on('dialog',dialog)
   await page.evaluate(SOURCE)
   actual=await page.evaluate('({exports:window.exports,runs:window.runs,selected:window.selected,scrolls:window.scrolls,notices:document.querySelectorAll("[role=status]").length})')
   expected=0 if options.get('absent') or options.get('wrong') else 1
   assert actual['exports']==expected,(name,actual,alerts)
   assert actual['notices']==0,(name,actual)
   assert actual['scrolls']>2,(name,actual)
   if options.get('absent'):assert actual['runs']==0
   else:assert actual['selected']=='0589'
   assert bool(alerts)==bool(options.get('absent') or options.get('wrong')),(name,alerts)
   print(name,'PASS',actual)
   await page.close()
  await browser.close()
if __name__ == '__main__':
 asyncio.run(main())
