import type {
  Compatibility,
  Dish,
  ExplainedDish,
  Preferences,
} from "./domain.js";

const groups: Record<string, string[]> = {
  milk: [
    "milk",
    "cheese",
    "feta",
    "yogurt",
    "crema",
    "parmesan",
    "cotija",
    "mizithra",
    "butter",
    "cream",
  ],
  "tree nuts": [
    "almond",
    "walnut",
    "cashew",
    "pecan",
    "pistachio",
    "hazelnut",
    "tree nut",
  ],
  wheat: [
    "wheat",
    "flour tortilla",
    "breadcrumb",
    "pita",
    "bulgur",
    "couscous",
  ],
  meat: [
    "chicken",
    "pork",
    "beef",
    "lamb",
    "bacon",
    "brisket",
    "carnitas",
    "meat",
  ],
  fish: ["fish", "salmon", "tuna", "anchov"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "shellfish"],
  egg: ["egg", "mayonnaise", "mayonesa", "aioli"],
  soy: ["soy", "tofu", "miso", "edamame"],
  sesame: ["sesame", "tahini"],
};
const termsFor = (s: string) => {
  const word = s.toLowerCase().trim();
  const aliases: Record<string, string> = {
    dairy: "milk",
    nuts: "tree nuts",
    gluten: "wheat",
  };
  return groups[aliases[word] ?? word] ?? [word.replace(/s$/, "")];
};
const mentions = (text: string, term: string) =>
  termsFor(term).some((t) =>
    new RegExp(
      `(?:^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?(?:$|[^a-z])`,
      "i",
    ).test(text),
  );

export function compatibility(dish: Dish, prefs: Preferences): Compatibility[] {
  // Ingredients and declared allergens are evidence. The absence of an ingredient is not proof of safety.
  const evidence = [...dish.ingredients, ...dish.declaredAllergens]
    .join(" ")
    .toLowerCase()
    .replace(/\bbutter lettuce\b/g, "lettuce");
  return [...prefs.diets, ...prefs.avoid.map((x) => `avoid:${x}`)].map(
    (preference) => {
      const forbidden =
        preference === "vegan"
          ? ["meat", "fish", "shellfish", "milk", "egg", "honey"]
          : preference === "vegetarian"
            ? ["meat", "fish", "shellfish", "gelatin"]
            : preference === "gluten-free"
              ? ["wheat", "barley", "rye"]
              : preference === "dairy-free"
                ? ["milk"]
                : [preference.slice(6)];
      const conflict = forbidden.find((x) => mentions(evidence, x));
      if (conflict)
        return {
          preference,
          status: "conflicts",
          reason: `The menu lists an ingredient associated with ${conflict}.`,
        } as Compatibility;
      const normalize = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "");
      const explicit = dish.declaredDiets.some(
        (x) =>
          normalize(x) === normalize(preference) ||
          (preference === "vegetarian" && normalize(x) === "vegan"),
      );
      return explicit
        ? {
            preference,
            status: "supported by menu",
            reason:
              "The restaurant explicitly labels this dish. Preparation and cross-contact still need confirmation.",
          }
        : {
            preference,
            status: "needs confirmation",
            reason:
              "The published menu does not confirm this preference. Ask the restaurant about ingredients and preparation.",
          };
    },
  );
}
export function explainDish(
  dish: Dish,
  preferences: Preferences,
): ExplainedDish {
  const text = [dish.name, ...dish.ingredients].join(" ").toLowerCase();
  const balance: string[] = [],
    swaps: string[] = [];
  if (
    ["meat", "fish", "shellfish"].some((x) =>
      mentions(text, x),
    ) ||
    /\beggs?\b|\btofu\b|\bedamame\b|\btempeh\b|chickpeas|lentils/.test(text)
  )
    balance.push(
      "Includes a protein source; the amount depends on the serving.",
    );
  if (
    /\b(?:kale|spinach|broccoli\w*|cabbage|cucumber\w*|tomato\w*|peppers?|zucchini|sweet potato|green beans?)\b/.test(
      text,
    )
  )
    balance.push("Includes vegetables that can contribute variety and fibre.");
  if (/wild rice|quinoa|lentils|chickpeas/.test(text))
    balance.push("Includes a grain or legume component.");
  if (/fried|crispy/.test(text)) {
    balance.push(
      "Fried or crispy preparation can add oil; the menu does not quantify it.",
    );
    swaps.push("Ask whether a grilled or roasted version is available.");
  }
  if (/dressing|sauce|aioli|crema|vinaigrette|yogurt/.test(text))
    swaps.push(
      "Ask for the dressing or sauce on the side so you can choose the amount.",
    );
  if (!balance.length)
    balance.push(
      "Portion size and preparation details are needed to assess how this fits your meal.",
    );
  const glossary: Record<string, string> = {
    avgolemono: "Avgolemono means an egg-and-lemon style of Greek soup.",
    harissa:
      "Harissa is generally a chilli paste; recipes and heat levels vary.",
    mizithra: "Mizithra is a Greek cheese.",
    cotija: "Cotija is a salty Mexican cheese.",
    poblano:
      "Poblano is a green chilli pepper, usually milder than many small chillies.",
    pepita: "Pepitas are pumpkin seeds.",
    miso: "Miso is a fermented seasoning, commonly made from soybeans.",
  };
  const context = Object.entries(glossary)
    .filter(([term]) => text.includes(term))
    .map(([, meaning]) => meaning)
    .join(" ");
  return {
    ...dish,
    explanation: [dish.description, context].filter(Boolean).join(" "),
    balance,
    swaps,
    compatibility: compatibility(dish, preferences),
  };
}
