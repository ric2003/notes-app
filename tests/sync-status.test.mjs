import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SyncStatusModule from "../src/components/SyncStatus.tsx";

const SyncStatus = SyncStatusModule.default ?? SyncStatusModule;

const base = {
  pending: 0,
  saving: 0,
  problems: [],
  failedDeletes: [],
  pendingDeletes: [],
  storageError: false,
};
const render = (status) =>
  renderToStaticMarkup(
    createElement(SyncStatus, {
      status: { ...base, ...status },
      sync: {},
      onRestore() {},
    }),
  );

test("routine saves and queued changes render no sync badge", () => {
  assert.equal(render({ pending: 1, saving: 1 }), "");
  assert.equal(render({ pending: 1 }), "");
  assert.equal(render({}), "");
});

test("save problems and actionable delete undo remain visible", () => {
  assert.match(
    render({ problems: [{ id: "n1", updates: {}, message: "Save failed" }] }),
    /Review changes/,
  );
  assert.equal(render({ pending: 1, storageError: true }), "");
  assert.equal(
    render({
      pending: 1,
      storageError: true,
      pendingDeletes: [{ note: { id: "n1" }, dueAt: 0 }],
    }),
    "",
  );
  assert.match(
    render({
      pendingDeletes: [{ note: { id: "n1" }, dueAt: Date.now() + 6000 }],
    }),
    /Undo/,
  );
});
