(async () => {
/* B10地区別売上: 公開DOMの操作だけを行うブックマークレット。 */
async function runExport(window) {
  'use strict';
  const {document, location} = window;
  const prompt = (...args) => window.prompt(...args);
  const alert = message => window.alert(message);
  const normalize = s => String(s || '').replace(/\s/g, '');
  const visible = el => el && el.getClientRects().length > 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = 'fsbi-b10-export-v1';
  let originalOpen;
  let wrappedOpen;
  let acquired = false;
  const popups = [];
  try {
    if (location.hostname !== 'in-bi.four-seeds.jp' || !location.pathname.startsWith('/fsbi/')) {
      throw new Error('会社の分析帳票サイトのメインメニュー、またはB10「地区別売上」で実行してください。');
    }
    if (window.__b10ExportRunning) throw new Error('すでに処理中です。しばらくお待ちください。');
    window.__b10ExportRunning = true;
    acquired = true;
    if (/^\/fsbi\/MenuPage\/MenuPage\/?$/.test(location.pathname)) {
      // メインメニューを残して同一サイトのB10を開く。親画面から処理を続ける。
      const target = window.open('/fsbi/RPTS00/recover?linkRpt=B10R01', '_blank');
      if (!target) throw new Error('地区別売上の画面を開けませんでした。ブラウザーにポップアップがブロックされた表示がないか確認してください。');
      for (let i = 0; i < 180; i++) {
        if (target.closed) throw new Error('地区別売上の画面が閉じられました。');
        let ready = false;
        try {
          const doc = target.document;
          ready = normalize(doc.body?.innerText).includes('B10：地区別売上') &&
            doc.querySelectorAll('main .ant-select [role="combobox"]').length === 2 &&
            doc.querySelector('.vxe-table tr[rowid]');
        } catch (error) {
          if (error.name !== 'SecurityError') throw error;
        }
        if (ready) {
          return await runExport(target);
        }
        await delay(250);
      }
      throw new Error('地区別売上の選択画面を開けませんでした。開いたタブにログイン画面やエラーがないか確認してください。');
    }
    const button = (doc, text) => [...doc.querySelectorAll('button')]
      .find(el => visible(el) && normalize(el.textContent) === normalize(text));
    let pending;
    try { pending = JSON.parse(window.sessionStorage.getItem(key)); } catch (_) {}
    if (!pending || Date.now() - pending.started > 180000) pending = null;
    const onReport = !!button(document, 'Excel出力');
    if (onReport && !pending) throw new Error('まず店舗・月を選ぶB10の検索画面で、このお気に入りを押してください。');
    if (!onReport && !normalize(document.body.innerText).includes('B10：地区別売上')) {
      throw new Error('B10「地区別売上」の検索画面を開いてください。');
    }
    if (!onReport) {
      const yearText = prompt('対象年（例：2026）', '2026');
      if (yearText === null) return;
      const monthText = prompt('対象月（1〜12）', '10');
      if (monthText === null) return;
      const storeText = prompt('店舗番号（例：0589）。店舗一覧を自動で探します。', '0589');
      if (storeText === null) return;
      if (!/^\d{4}$/.test(yearText.trim()) || !/^\d{1,2}$/.test(monthText.trim()) || !/^\d{1,4}$/.test(storeText.trim())) {
        throw new Error('年・月・店舗番号を半角数字で入力してください。');
      }
      const year = Number(yearText), month = Number(monthText), store = storeText.trim().padStart(4, '0');
      if (year < 2000 || year > 2100 || month < 1 || month > 12) throw new Error('年または月が範囲外です。');
      const radio = text => {
        const label = [...document.querySelectorAll('label.ant-radio-wrapper')]
          .find(el => normalize(el.textContent) === text);
        if (!label) throw new Error(text + 'の選択欄が見つかりません。');
        label.click();
      };
      radio('月指定');
      await delay(100);
      const selects = [...document.querySelectorAll('main .ant-select')].filter(visible);
      if (selects.length !== 2) throw new Error('年月の選択欄の構造が想定と異なります。処理を停止しました。');
      async function choose(select, text) {
        const current = () => normalize(select.querySelector('.ant-select-selection-selected-value')?.textContent);
        if (current() === text) return;
        select.querySelector('[role="combobox"]').click();
        let option;
        for (let i = 0; i < 30 && !option; i++) {
          option = [...document.querySelectorAll('.ant-select-dropdown-menu-item')]
            .find(el => visible(el) && normalize(el.textContent) === text);
          if (!option) await delay(100);
        }
        if (!option) throw new Error(text + 'の候補が見つかりません。');
        option.click();
        await delay(150);
        if (current() !== text) throw new Error(text + 'への切り替えを確認できませんでした。');
      }
      await choose(selects[0], year + '年');
      await choose(selects[1], month + '月');
      radio('日付あわせ');
      // 仮想スクロールでは画面外の店舗行がDOMにないため、一覧を順に送る。
      const codeMatches = value => /^\d{1,4}$/.test(normalize(value)) && normalize(value).padStart(4, '0') === store;
      const findRow = () => [...document.querySelectorAll('.vxe-table tr[rowid]')].find(el =>
        visible(el) && (codeMatches(el.getAttribute('rowid')) ||
          [...el.querySelectorAll('.vxe-cell--label')].some(cell => codeMatches(cell.textContent))));
      async function locateStore() {
        let row = findRow();
        if (row) return row;
        const wrappers = [...document.querySelectorAll('.vxe-table .vxe-table--body-wrapper')]
          .filter(el => visible(el) && el.clientHeight > 0);
        const deadline = Date.now() + 45000;
        const notice = document.createElement('div');
        notice.textContent = '店舗 ' + store + ' を一覧から探しています…';
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'position:fixed;right:20px;top:20px;z-index:2147483647;padding:14px;background:#173653;color:white;border-radius:8px;pointer-events:none';
        document.body.appendChild(notice);
        try {
          for (const wrapper of wrappers) {
            const originalTop = wrapper.scrollTop;
            wrapper.scrollTop = 0;
            wrapper.dispatchEvent(new window.Event('scroll'));
            await delay(200);
            for (let step = 0; step < 600 && Date.now() < deadline; step++) {
              row = findRow();
              if (row) return row;
              const maxTop = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
              if (wrapper.scrollTop >= maxTop - 1) {
                await delay(300);
                row = findRow();
                if (row) return row;
                if (wrapper.scrollTop >= wrapper.scrollHeight - wrapper.clientHeight - 1) break;
              }
              const before = wrapper.scrollTop;
              wrapper.scrollTop = Math.min(wrapper.scrollHeight - wrapper.clientHeight,
                before + Math.max(32, Math.floor(wrapper.clientHeight * 0.8)));
              wrapper.dispatchEvent(new window.Event('scroll'));
              await delay(160);
              if (wrapper.scrollTop === before) break;
            }
            wrapper.scrollTop = originalTop;
            wrapper.dispatchEvent(new window.Event('scroll'));
            await delay(160);
          }
          return findRow();
        } finally { notice.remove(); }
      }
      const row = await locateStore();
      if (!row) throw new Error('店舗 ' + store + ' を一覧から見つけられませんでした。以前の店舗絞込みが残っている場合は解除してください。表示権限や閉店店舗の設定によって一覧にない店舗は選べません。');
      const storeRadio = row.querySelector('.vxe-cell--radio');
      if (!storeRadio) throw new Error('店舗の選択ボタンが見つかりません。');
      storeRadio.click();
      await delay(150);
      if (!findRow()?.querySelector('.vxe-cell--radio.is--checked')) throw new Error('店舗選択を確認できませんでした。');
      const dateRadio = [...document.querySelectorAll('label.ant-radio-wrapper')].find(el => normalize(el.textContent) === '日付あわせ');
      if (!dateRadio?.classList.contains('ant-radio-wrapper-checked')) throw new Error('日付あわせの選択を確認できませんでした。');
      const run = button(document, '実行');
      if (!run || run.disabled) throw new Error('実行ボタンを操作できません。');
      pending = {year, month, store, started: Date.now()};
      window.sessionStorage.setItem(key, JSON.stringify(pending));
      originalOpen = window.open;
      wrappedOpen = function (...args) {
        const child = originalOpen.apply(window, args);
        if (child) popups.push(child);
        return child;
      };
      window.open = wrappedOpen;
      run.click();
    }
    // SPA内の遷移と、参照可能な同一オリジンの別窓を待つ。
    for (let i = 0; i < 240; i++) {
      for (const win of [window, ...popups]) {
        let doc;
        try { doc = win.document; } catch (_) { continue; }
        const excel = button(doc, 'Excel出力');
        if (!excel || excel.disabled) continue;
        const header = normalize(doc.querySelector('header')?.innerText);
        const storeMatch = header.match(/店舗[:：](\d{4})/);
        const periodMatch = header.match(/期間[:：](\d{4})\/(\d{1,2})\/(\d{1,2})[～〜~](\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (!storeMatch || !periodMatch) throw new Error('結果画面の店舗・期間を読み取れません。Excel出力を停止しました。');
        if (storeMatch[1] !== pending.store || Number(periodMatch[1]) !== pending.year || Number(periodMatch[2]) !== pending.month || Number(periodMatch[4]) !== pending.year || Number(periodMatch[5]) !== pending.month) {
          throw new Error('結果画面の店舗または対象月が指定と違います。Excel出力を停止しました。');
        }
        window.sessionStorage.removeItem(key);
        excel.click();
        return pending; // クリックの成功は、ダウンロード完了の保証ではない。
      }
      await delay(250);
    }
    throw new Error('結果画面を自動で取得できませんでした。結果画面で同じお気に入りをもう一度押してください。');
  } catch (error) {
    if (acquired) window.sessionStorage.removeItem(key);
    alert('地区別売上：' + error.message);
  } finally {
    if (wrappedOpen && window.open === wrappedOpen) window.open = originalOpen;
    if (acquired) window.__b10ExportRunning = false;
  }
}
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

/* build.py が既存のB10処理とB119選択処理と合わせて配布する。 */
async function runCombinedExport(root) {
  const normalize = s => String(s || '').replace(/\s/g, '');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => el && el.getClientRects().length > 0;
  if (root.__fsbiCombinedExportRunning) {
    root.alert('地区別売上・食材理論値の出力は処理中です。');
    return;
  }
  if (root.location.hostname !== 'in-bi.four-seeds.jp' ||
      !/^\/fsbi\/MenuPage\/MenuPage\/?$/.test(root.location.pathname)) {
    root.alert('分析帳票のメインメニューで「地区別＋食材を出力 v4」を押してください。');
    return;
  }
  root.__fsbiCombinedExportRunning = true;
  let panel, frame, status, originalOpen, wrappedOpen, foodWindow;
  let districtRequested = false;
  try {
    const request = await runExport(root);
    if (!request) return;
    districtRequested = true;
    // B10の画面を残し、進行中のダウンロードを画面遷移で中断しない。
    panel = root.document.createElement('section');
    panel.style.cssText = 'position:fixed;inset:4vh 2vw;z-index:2147483647;background:white;border:2px solid #1762ad;box-shadow:0 4px 30px #555;display:flex;flex-direction:column';
    const bar = root.document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#1762ad;color:white;padding:10px';
    status = root.document.createElement('span');
    status.setAttribute('role', 'status');
    status.textContent = '食材理論値：選択画面の読み込み中…';
    const close = root.document.createElement('button');
    close.textContent = '閉じる';
    close.onclick = () => panel.remove();
    bar.append(status, close);
    frame = root.document.createElement('iframe');
    frame.title = 'B119 食材理論値（指定月の前月）';
    frame.style.cssText = 'flex:1;width:100%;border:0';
    frame.src = '/fsbi/RPTB119/initialize?linkRpt=B119R01';
    panel.append(bar, frame);
    root.document.body.appendChild(panel);
    const checkOpen = () => {
      if (!panel.isConnected) throw new Error('食材理論値の処理を中止しました。');
    };
    for (let i = 0; i < 180; i++) {
      checkOpen();
      try {
        const doc = frame.contentDocument;
        if (doc && normalize(doc.body?.innerText).includes('B119：食材理論値') &&
            doc.querySelectorAll('main .ant-select [role="combobox"]').length === 2 &&
            doc.querySelector('.vxe-table tr[rowid]')) {
          foodWindow = frame.contentWindow;
          break;
        }
      } catch (error) {
        if (error.name !== 'SecurityError') throw error;
      }
      await delay(250);
    }
    if (!foodWindow) throw new Error('B119を画面内で開けませんでした。画面内のエラー表示やログイン状態を確認してください。');
    status.textContent = '食材理論値：前月・同じ店舗を設定中…';
    const {target, run} = await prepareFoodReport(foodWindow, request);
    checkOpen();
    status.textContent = '食材理論値：' + target.year + '年' + target.month + '月・店舗' + target.store + ' の結果を待っています…';
    const popups = [];
    originalOpen = foodWindow.open;
    wrappedOpen = function (...args) {
      const child = originalOpen.apply(foodWindow, args);
      if (child) popups.push(child);
      return child;
    };
    foodWindow.open = wrappedOpen;
    run.click();
    for (let i = 0; i < 240; i++) {
      checkOpen();
      for (const win of [foodWindow, ...popups]) {
        let doc;
        try { doc = win.document; } catch (_) { continue; }
        const excel = [...doc.querySelectorAll('footer button, button')]
          .find(el => visible(el) && normalize(el.textContent) === 'Excel出力');
        if (!excel || excel.disabled) continue;
        const header = normalize(doc.querySelector('header')?.innerText);
        if (!header.includes('食材理論値')) throw new Error('食材理論値以外の結果画面です。出力を停止しました。');
        const store = header.match(/店舗[:：](\d{4})/);
        const period = header.match(/期間[:：](\d{4})\/(\d{1,2})\/(\d{1,2})[～〜~](\d{4})\/(\d{1,2})\/(\d{1,2})/);
        const lastDay = new Date(target.year, target.month, 0).getDate();
        if (!store || !period || store[1] !== target.store ||
            Number(period[1]) !== target.year || Number(period[2]) !== target.month || Number(period[3]) !== 1 ||
            Number(period[4]) !== target.year || Number(period[5]) !== target.month || Number(period[6]) !== lastDay) {
          throw new Error('食材理論値の店舗または期間が指定した前月と一致しません。出力を停止しました。');
        }
        excel.click();
        status.textContent = '地区別売上・食材理論値のExcel出力を指示しました。ダウンロード一覧で2ファイルを確認してください。';
        return;
      }
      await delay(250);
    }
    throw new Error('食材理論値のExcel出力画面を確認できませんでした。');
  } catch (error) {
    if (status) status.textContent = '食材理論値：' + error.message;
    root.alert((districtRequested ? '地区別売上のExcel出力は指示済みです。食材理論値：' : '') + error.message);
  } finally {
    if (foodWindow && foodWindow.open === wrappedOpen) foodWindow.open = originalOpen;
    root.__fsbiCombinedExportRunning = false;
  }
}

await runCombinedExport(window);
})();
