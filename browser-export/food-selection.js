/* B119選択画面を、同じ店舗・指定月の前月の月次に設定する。 */
async function prepareFoodReport(win, request) {
  const year = Number(request.year), month = Number(request.month);
  const storeText = String(request.store).trim();
  if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12 || !/^\d{1,4}$/.test(storeText)) {
    throw new Error('年・月・店舗番号が不正です。');
  }
  const target = {
    year: month === 1 ? year - 1 : year,
    month: month === 1 ? 12 : month - 1,
    store: storeText.padStart(4, '0'),
  };
  const doc = win.document;
  const normalize = s => String(s || '').replace(/\s/g, '');
  const visible = el => el && el.getClientRects().length > 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (win.location.hostname !== 'in-bi.four-seeds.jp' ||
      !normalize(doc.body.innerText).includes('B119：食材理論値')) {
    throw new Error('B119「食材理論値」の選択画面を開いてください。');
  }
  const monthly = [...doc.querySelectorAll('label.ant-radio-wrapper')]
    .find(el => normalize(el.textContent) === '月次');
  if (!monthly) throw new Error('月次の選択欄が見つかりません。');
  monthly.click();
  await delay(100);
  const selects = [...doc.querySelectorAll('main .ant-select')].filter(visible);
  if (selects.length !== 2) throw new Error('棚卸確定月の年月欄を特定できません。');
  async function choose(select, text) {
    const current = () => normalize(select.querySelector('.ant-select-selection-selected-value')?.textContent);
    if (current() === text) return;
    select.querySelector('[role="combobox"]').click();
    for (let i = 0; i < 30; i++) {
      const option = [...doc.querySelectorAll('.ant-select-dropdown-menu-item')]
        .find(el => visible(el) && normalize(el.textContent) === text);
      if (option) {
        option.click();
        await delay(150);
        if (current() !== text) throw new Error(text + 'の選択を確認できません。');
        return;
      }
      await delay(100);
    }
    throw new Error(text + 'の候補が見つかりません。');
  }
  await choose(selects[0], target.year + '年');
  await choose(selects[1], target.month + '月');
  const codeMatches = value => /^\d{1,4}$/.test(normalize(value)) && normalize(value).padStart(4, '0') === target.store;
  const findRow = () => [...doc.querySelectorAll('.vxe-table tr[rowid]')].find(el =>
    visible(el) && (codeMatches(el.getAttribute('rowid')) ||
      [...el.querySelectorAll('.vxe-cell--label')].some(c => codeMatches(c.textContent))));
  let row = findRow();
  const deadline = Date.now() + 45000;
  if (!row) {
    for (const wrapper of [...doc.querySelectorAll('.vxe-table .vxe-table--body-wrapper')].filter(visible)) {
      if (!wrapper.clientHeight) continue;
      wrapper.scrollTop = 0;
      wrapper.dispatchEvent(new win.Event('scroll'));
      await delay(200);
      for (let i = 0; i < 600 && Date.now() < deadline; i++) {
        row = findRow();
        if (row) break;
        if (wrapper.scrollTop >= wrapper.scrollHeight - wrapper.clientHeight - 1) {
          await delay(300);
          row = findRow();
          if (row || wrapper.scrollTop >= wrapper.scrollHeight - wrapper.clientHeight - 1) break;
        }
        const before = wrapper.scrollTop;
        wrapper.scrollTop = Math.min(wrapper.scrollHeight - wrapper.clientHeight,
          before + Math.max(32, Math.floor(wrapper.clientHeight * 0.8)));
        wrapper.dispatchEvent(new win.Event('scroll'));
        await delay(160);
        if (wrapper.scrollTop === before) break;
      }
      if (row) break;
    }
  }
  if (!row) throw new Error('店舗 ' + target.store + ' がB119の一覧に見つかりません。');
  const radio = row.querySelector('.vxe-cell--radio');
  if (!radio) throw new Error('店舗の選択欄が見つかりません。');
  radio.click();
  await delay(150);
  if (!findRow()?.querySelector('.vxe-cell--radio.is--checked')) throw new Error('店舗選択を確認できません。');
  if (!monthly.classList.contains('ant-radio-wrapper-checked')) throw new Error('月次の選択を確認できません。');
  const run = [...doc.querySelectorAll('button')].find(el => visible(el) && normalize(el.textContent) === '実行');
  if (!run || run.disabled) throw new Error('B119の実行ボタンを操作できません。');
  // 呼び出し側が実行前に結果画面の監視を開始できるよう、ボタンを返す。
  return {target, run};
}
