"""単体B10処理とB119処理を、外部読み込み不要の配布ファイルへまとめる。"""
from pathlib import Path
from urllib.parse import quote
from html import escape
root=Path(__file__).resolve().parent
source=(root/'export.js').read_text()
assert source.rstrip().endswith('})(window);')
district=source.replace('(async function runExport(window) {','async function runExport(window) {',1).rstrip().removesuffix('})(window);')+'}'
combined='(async () => {\n'+district+'\n'+(root/'food-selection.js').read_text()+'\n'+(root/'combined-controller.js').read_text()+'\nawait runCombinedExport(window);\n})();\n'
(root/'combined-export.js').write_text(combined)
url='javascript:void '+quote(combined,safe="()'!~*.-_")
page='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>地区別売上＋食材理論値 v4</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:48px auto;padding:0 24px;color:#183047;line-height:1.9}h1{font-size:26px}a.bookmark{display:inline-block;background:#086bd8;color:white;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold}li{margin:12px 0}.note{background:#f0f5fa;padding:16px;border-radius:8px}pre{white-space:pre-wrap;font-size:12px}</style>
<h1>地区別売上＋食材理論値を出力 v4</h1>
<p>分析帳票のメインメニューから、同じ店舗のExcelを2種類出力します。</p>
<h2>最初の登録</h2><ol><li>このHTMLを会社のPCのEdgeまたはChromeで開きます。</li><li>Ctrl＋Shift＋Bでお気に入りバーを表示します。</li><li>下の青いボタンをお気に入りバーへドラッグします。古いv3とは別に登録してください。</li></ol>
<p><a class="bookmark" href="__URL__">地区別＋食材を出力 v4</a></p>
<h2>使い方</h2><ol><li>会社サイトの「Fourseeds 分析帳票」メインメニューを開きます。</li><li>お気に入り「地区別＋食材を出力 v4」を押し、年・月・店舗番号を入力します。</li><li>B10地区別売上は指定月の日付あわせで、B119食材理論値は指定月の前月の月次で出力します。例：2026年10月→地区別10月・食材9月。2026年1月→食材2025年12月。</li><li>メインメニューは閉じずに待ち、ブラウザーのダウンロード一覧で2ファイルを確認します。食材の結果はメインメニュー内に開きます。</li></ol>
<div class="note"><strong>確認事項</strong><ul><li>会社サイトでのv4の実動作は未検証です。テスト用の画面で条件設定と2ファイルの保存を確認済みです。</li><li>出力ボタンの操作だけではダウンロード完了を判定できません。ブラウザーで複数ファイルのダウンロード許可が表示された場合は、内容を確認してください。</li><li>ブランドは現在の設定です。店舗一覧から除外されている店舗は選べません。</li><li>会社サイトが画面内の表示を許可していない場合はB119の処理が停止します。その場合のエラーをお知らせください。</li><li>Cookie・パスワードを読み取ったり、帳票データを外部へ送信したりする処理はありません。</li></ul></div>
<details><summary>実行するコード</summary><pre>__CODE__</pre></details></html>'''
page=page.replace('__URL__',escape(url,quote=True)).replace('__CODE__',escape(combined))
(root/'地区別売上_お気に入り登録.html').write_text(page)
print('Generated combined-export.js and v4 registration HTML')
