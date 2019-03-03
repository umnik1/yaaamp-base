const fs = require("fs");
const postcss = require("postcss");

const plugin = require("./postcss-optimize-data-uri-pngs");

const css = fs.readFileSync("./css/base-skin.css", "utf8");
it("does something", async () => {
  const result = await postcss([plugin({})]).process(css);
  expect(result.css.length).toBeLessThan(css.length);
});
