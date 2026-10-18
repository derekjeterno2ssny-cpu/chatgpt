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
