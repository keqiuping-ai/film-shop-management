const { test } = require("node:test");
const assert = require("node:assert/strict");
const create = require("../lib/website-messages");
test("guest isolation, staff access, persistence, validation and retry deduplication", async () => {
  let db = { users: [{ id: "staff", active: true }] },
    writes = 0,
    events = 0;
  const route = create({
    readDb: () => db,
    writeDb: (value) => {
      db = JSON.parse(JSON.stringify(value));
      writes++;
    },
    readBody: async (req) => req.body,
    send: (res, status, body) => Object.assign(res, { status, body }),
    notifyDataChanged: () => events++,
  });
  async function call(
    path,
    method = "GET",
    body = {},
    secret = "",
    user = null,
  ) {
    const res = {};
    await route(
      {
        method,
        body,
        headers: { "x-website-chat-token": secret },
        socket: { remoteAddress: "test" },
      },
      res,
      new URL(path, "http://test"),
      user,
    );
    return res;
  }
  assert.equal((await call("/api/website-messages")).status, 403);
  assert.equal(
    (await call("/api/website-chat", "POST", { text: "Hi" })).status,
    400,
  );
  const a = await call("/api/website-chat", "POST", {
    name: "Alice",
    contact: "a@example.test",
    text: "Hello",
    requestId: "1",
  });
  assert.equal(a.status, 200);
  assert.ok(a.body.token);
  assert.equal(a.body.secretHash, undefined);
  const b = await call("/api/website-chat", "POST", {
    name: "Bob",
    contact: "b@example.test",
    text: "Question",
  });
  assert.notEqual(a.body.id, b.body.id);
  const read = await call("/api/website-chat", "GET", {}, a.body.token);
  assert.equal(read.body.messages.length, 1);
  assert.equal(read.body.name, "Alice");
  assert.equal(JSON.stringify(read.body).includes("Bob"), false);
  assert.equal(
    (await call("/api/website-chat", "GET", {}, "wrong")).status,
    404,
  );
  assert.equal(
    (await call("/api/website-chat", "POST", { text: "hack" }, "wrong")).status,
    404,
  );
  const staff = { id: "staff", name: "Sales" };
  const list = await call("/api/website-messages", "GET", {}, "", staff);
  assert.equal(list.body.length, 2);
  assert.equal(JSON.stringify(list.body).includes("secretHash"), false);
  assert.equal(JSON.stringify(list.body).includes(a.body.token), false);
  await call(
    "/api/website-messages",
    "POST",
    { id: a.body.id, text: "Welcome", requestId: "reply1" },
    "",
    staff,
  );
  await call(
    "/api/website-messages",
    "POST",
    { id: a.body.id, text: "Welcome", requestId: "reply1" },
    "",
    staff,
  );
  assert.equal(
    (await call("/api/website-chat", "GET", {}, a.body.token)).body.messages
      .length,
    2,
  );
  assert.equal(
    (await call("/api/website-chat", "GET", {}, b.body.token)).body.messages
      .length,
    1,
  );
  assert.equal(
    (
      await call(
        "/api/website-messages",
        "POST",
        { id: a.body.id, text: "x" },
        "",
        { id: "outsider" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/website-chat",
        "POST",
        { text: "x".repeat(4001) },
        a.body.token,
      )
    ).status,
    400,
  );
  assert.equal(writes, 3);
  assert.equal(events, 3);
});
