const response = await fetch("http://127.0.0.1:8787/api/consult/yesterday", { method: "POST" });
const body = await response.json();
console.log(response.status, body.ok, body.day, body.items?.length);
for (const item of body.items || []) {
  console.log(`${item.ok ? "OK" : "NO"} ${item.publishedAt} ${item.title}`);
}
