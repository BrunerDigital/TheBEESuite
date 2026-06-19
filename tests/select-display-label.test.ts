import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../src/components/ui/select";

test("closed select trigger renders the selected item label instead of the raw id", () => {
  const selectedId = "clx9f4e1a0000encrypted-location-id";
  const html = renderToString(
    React.createElement(
      Select,
      { value: selectedId },
      React.createElement(
        SelectTrigger,
        null,
        React.createElement(SelectValue, { placeholder: "Choose location" }),
      ),
      React.createElement(
        SelectContent,
        null,
        React.createElement(SelectItem, { value: selectedId }, "Westfield Kid City USA"),
        React.createElement(SelectItem, { value: "other-location-id" }, "Kokomo Kid City USA"),
      ),
    ),
  );
  const visibleValue = html.match(/data-slot="select-value"[^>]*>(.*?)<\/span>/)?.[1] ?? "";

  assert.equal(visibleValue, "Westfield Kid City USA");
  assert.equal(visibleValue.includes(selectedId), false);
  assert.equal(html.includes(`value="${selectedId}"`), true);
});
