function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('JSON Studio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
