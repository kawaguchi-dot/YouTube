/*
  Screenshot-Annotator
  Copyright (c) 2025 Majin
  
  Note: https://note.com/majin_108
  X: https://x.com/Majin_AppSheet
  
  [利用規約・ライセンス]
  
  1. 利用許諾
     - 購入者本人のみに利用権が付与されます。
     - 購入者本人が使用する限り、個人のPCおよび会社のPCで使用可能です。
     - 個人的な利用の範囲内であれば、自由に改変して使用できます。
  
  2. 禁止事項
     - 改変の有無にかかわらず、本ソフトウェアを第三者へ配布、公開、販売する行為
  
  3. 免責事項
     - 本ソフトウェアは「現状のまま」提供されます。
     - 本ソフトウェアの使用によって生じたいかなる損害（データ消失、業務の中断、
       予期せぬ動作等）についても、開発者は一切の責任を負いません。
     - 利用者は自己の責任において本ソフトウェアを使用するものとします。
     - Google Chromeのアップデート等で予期せぬタイミングで使えなくなる可能性があります。
       その際の保守対応は、原則として行っておりません。
*/

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('editor.html')
  });
});