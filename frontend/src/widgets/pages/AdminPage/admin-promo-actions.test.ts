import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("promo controls restore compact labelled ActionIcon edit and delete actions", () => {
  const tab = readFileSync(new URL("./sections/AdminPromosTab.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./sections/AdminPromosTab.module.css", import.meta.url), "utf8");

  assert.match(tab, /ActionIcon/);
  assert.match(tab, /IconPencil/);
  assert.match(tab, /IconTrash/);
  assert.match(tab, /size=\{40\}/);
  assert.match(tab, /aria-label="Редактировать промокод"/);
  assert.match(tab, /aria-label="Удалить промокод"/);
  assert.match(tab, /loading=\{deleting\}/);
  assert.match(tab, /Tooltip/);
  assert.match(styles, /min-width:\s*max-content/);
});
