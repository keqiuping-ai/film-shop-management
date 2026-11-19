const { test } = require("node:test");
const assert = require("node:assert/strict");
const create = require("../lib/website-messages");
test("guest isolation, staff access, persistence, validation and retry deduplication", async () => {
  let db = { users: [{ id: "staff", active: true }] },
    writes = 0,
    events = 0,
    incomingTranslationCalls = 0;
  const route = create({
    readDb: () => db,
    writeDb: (value) => {
      db = JSON.parse(JSON.stringify(value));
      writes++;
    },
    readBody: async (req) => req.body,
    send: (res, status, body) => Object.assign(res, { status, body }),
    notifyDataChanged: () => events++,
    translateIncoming: async (text) => {
      incomingTranslationCalls++;
      return { text: `中文译文：${text}` };
    },
    translateReply: async () => ({ englishText: "Hello, how can we help?" }),
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
  const aliceMessageId = list.body.find((row) => row.id === a.body.id).messages[0].id;
  const translatedIncoming = await call(
    "/api/website-messages/translate-message",
    "POST",
    { id: a.body.id, messageId: aliceMessageId },
    "",
    staff,
  );
  assert.equal(translatedIncoming.status, 200);
  assert.equal(translatedIncoming.body.translation, "中文译文：Hello");
  const translatedIncomingCached = await call(
    "/api/website-messages/translate-message",
    "POST",
    { id: a.body.id, messageId: aliceMessageId },
    "",
    staff,
  );
  assert.equal(translatedIncomingCached.body.translation, "中文译文：Hello");
  assert.equal(incomingTranslationCalls, 1);
  const guestAfterTranslation = await call(
    "/api/website-chat",
    "GET",
    {},
    a.body.token,
  );
  assert.equal(JSON.stringify(guestAfterTranslation.body).includes("translationZh"), false);
  const staffAfterTranslation = await call(
    "/api/website-messages",
    "GET",
    {},
    "",
    staff,
  );
  assert.equal(
    staffAfterTranslation.body.find((row) => row.id === a.body.id).messages[0]
      .translationZh,
    "中文译文：Hello",
  );
  const translatedReply = await call(
    "/api/website-messages/translate-reply",
    "POST",
    { id: a.body.id, text: "你好，请问需要什么帮助？" },
    "",
    staff,
  );
  assert.equal(translatedReply.status, 200);
  assert.equal(translatedReply.body.englishText, "Hello, how can we help?");
  const blockedChinese = await call(
    "/api/website-messages",
    "POST",
    { id: a.body.id, text: "这段中文不能直接发出去" },
    "",
    staff,
  );
  assert.equal(blockedChinese.status, 400);
  assert.match(blockedChinese.body.error, /阻止发送/);
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
  assert.equal(writes, 4);
  assert.equal(events, 4);
});
