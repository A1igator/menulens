import { test } from "node:test";
import assert from "node:assert/strict";
import { attachMenuPhotos, readMenuPhoto } from "../src/photos.js";
import { fixtureMenus } from "../src/fixtures.js";

const dish = {...fixtureMenus[0].dishes[0], name:"Honey Glazed Salmon*"};
const source = "https://restaurant.example/menu";
test("photos require an explicit exact dish caption from the menu page", () => {
  const [matched] = attachMenuPhotos([dish], "![Photo of Honey Glazed Salmon](/salmon.jpg)", source);
  assert.equal(matched.photo?.url, "https://restaurant.example/salmon.jpg");
  assert.equal(matched.photo?.sourceUrl, source);
  for (const text of ["![salmon](/fish.jpg)", "![Restaurant dining room](/salmon.jpg)", "# Honey Glazed Salmon\n![Food](/salmon.jpg)", "No images"]) {
    assert.equal(attachMenuPhotos([dish], text, source)[0].photo, undefined);
  }
});
test("ambiguous images, reused artwork, unsafe URLs and model-invented photos are omitted", () => {
  for (const text of [
    "![Honey Glazed Salmon](https://127.0.0.1/fish.jpg)",
    "![Honey Glazed Salmon](http://restaurant.example/fish.jpg)",
    "![Honey Glazed Salmon](https://user:pass@restaurant.example/fish.jpg)",
    "![Honey Glazed Salmon](/one.jpg)\n![Honey Glazed Salmon](/two.jpg)",
    "![Honey Glazed Salmon](/one.jpg)\n![Chicken](/one.jpg)",
  ]) assert.equal(attachMenuPhotos([dish], text, source)[0].photo, undefined);
  assert.equal(attachMenuPhotos([{...dish, photo:{url:"https://fake.example/image.jpg",caption:dish.name,sourceUrl:source}}], "", source)[0].photo, undefined);
});
test("photo transport rejects literal private addresses without a network request", async () => {
  for (const url of ["https://127.0.0.1/a.jpg", "https://[::1]/a.jpg", "http://restaurant.example/a.jpg", "https://localhost/a.jpg"]) {
    await assert.rejects(readMenuPhoto(url));
  }
});
