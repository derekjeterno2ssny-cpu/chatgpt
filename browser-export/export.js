/* B10地区別売上: 公開DOMの操作だけを行うブックマークレット。 */
(async () => {
  'use strict';
  const normalize = s => String(s || '').replace(/\s/g, '');
  const visible = el => el && el.getClientRects().length > 0;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = 'fsbi-b10-export-v1';
  let originalOpen;
  let wrappedOpen;
  const popups = [];
  try {
    if (location.hostname !== 'in-bi.four-seeds.jp' || !location.pathname.startsWith('/fsbi/')) {
      throw new Error('会社の分析帳票サイトで、B10「地区別売上」を開いてから実行してください。');
    }
    if (window.__b10ExportRunning) throw new Error('すでに処理中です。しばらくお待ちください。');
    window.__b10ExportRunning = true;
    const button = (doc, text) => [...doc.querySelectorAll('button')]
      .find(el => visible(el) && normalize(el.textContent) === normalize(text));
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem(key)); } catch (_) {}
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
      const storeText = prompt('店舗番号（例：0589）。店舗は検索画面の一覧に表示されている必要があります。', '0589');
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
      const row = [...document.querySelectorAll('tr[rowid]')].find(el => el.getAttribute('rowid') === store && visible(el));
      if (!row) throw new Error('店舗 ' + store + ' が一覧にありません。店舗絞込みで表示してから、もう一度実行してください。');
      const storeRadio = row.querySelector('.vxe-cell--radio');
      if (!storeRadio) throw new Error('店舗の選択ボタンが見つかりません。');
      storeRadio.click();
      await delay(150);
      if (!storeRadio.classList.contains('is--checked')) throw new Error('店舗選択を確認できませんでした。');
      const dateRadio = [...document.querySelectorAll('label.ant-radio-wrapper')].find(el => normalize(el.textContent) === '日付あわせ');
      if (!dateRadio?.classList.contains('ant-radio-wrapper-checked')) throw new Error('日付あわせの選択を確認できませんでした。');
      const run = button(document, '実行');
      if (!run || run.disabled) throw new Error('実行ボタンを操作できません。');
      pending = {year, month, store, started: Date.now()};
      sessionStorage.setItem(key, JSON.stringify(pending));
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
        sessionStorage.removeItem(key);
        excel.click();
        return; // クリックの成功は、ダウンロード完了の保証ではない。
      }
      await delay(250);
    }
    throw new Error('結果画面を自動で取得できませんでした。結果画面で同じお気に入りをもう一度押してください。');
  } catch (error) {
    sessionStorage.removeItem(key);
    alert('地区別売上：' + error.message);
  } finally {
    if (wrappedOpen && window.open === wrappedOpen) window.open = originalOpen;
    window.__b10ExportRunning = false;
  }
})();
