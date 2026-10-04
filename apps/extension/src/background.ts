chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // Open synchronously in the user gesture, then remember only this invoked tab.
  void chrome.sidePanel.open({ tabId: tab.id });
  void chrome.storage.session.set({ invokedTabId: tab.id });
});
