/* =====================================================================
   PROJECT 75 — food.js
   The Food Accountability System.

   This module is deliberately FIRM. It does not negotiate.
   If the plan says no soda, it says: "Soda is not part of today's agreement."
   It never says "you cheated" or "you failed" — it holds the line kindly.
   ===================================================================== */
(function (global) {
  'use strict';

  /* Aligned choices — protein first, whole foods, water. */
  const ALIGNED = [
    'chicken', 'grilled chicken', 'turkey', 'egg', 'eggs', 'boiled egg', 'omelette',
    'fish', 'salmon', 'tuna', 'sardine', 'mackerel', 'shrimp', 'prawns',
    'beef', 'lean beef', 'steak', 'goat meat', 'liver',
    'greek yogurt', 'yogurt', 'cottage cheese', 'tofu', 'beans', 'lentils', 'chickpeas',
    'apple', 'orange', 'berries', 'strawberberries', 'strawberries', 'blueberries', 'pear', 'watermelon',
    'vegetables', 'salad', 'broccoli', 'spinach', 'kale', 'ugu', 'efo', 'cucumber', 'carrot', 'carrots',
    'pepper soup', 'avocado', 'nuts', 'almonds', 'walnuts', 'garden egg',
    'oats', 'oatmeal', 'sweet potato', 'brown rice', 'moi moi', 'water', 'green tea', 'herbal tea',
    'boiled plantain', 'okra', 'okro', 'vegetable soup', 'grilled fish'
  ];

  /* Not part of the plan — soft "no" without shame. */
  const OFFPLAN = [
    'soda', 'soft drink', 'coke', 'coca cola', 'pepsi', 'fanta', 'sprite', 'malt', 'mountain dew', 'energy drink',
    'chocolate', 'candy', 'sweets', 'lollipop', 'toffee',
    'office cake', 'cake', 'cupcake', 'birthday cake', 'donut', 'doughnut', 'pastry', 'meat pie', 'sausage roll',
    'office snack', 'office snacks', 'snack', 'snacks', 'chips', 'crisps', 'biscuit', 'biscuits', 'cookie', 'cookies',
    'ice cream', 'french fries', 'fries', 'fried chicken', 'shawarma', 'burger', 'pizza',
    'white bread', 'sugary juice', 'juice', 'wine', 'beer', 'cocktail', 'chin chin', 'puff puff',
    'gala', 'plantain chips', 'popcorn'
  ];

  /* Bespoke firm lines for the named non-negotiables. */
  const SPECIAL = {
    soda:            'Soda is not part of today’s agreement.',
    'soft drink':    'Soda is not part of today’s agreement.',
    coke:            'Soda is not part of today’s agreement.',
    fanta:           'Soda is not part of today’s agreement.',
    sprite:          'Soda is not part of today’s agreement.',
    pepsi:           'Soda is not part of today’s agreement.',
    malt:            'Soda is not part of today’s agreement.',
    'office snack':  'This isn’t part of today’s plan.',
    'office snacks': 'This isn’t part of today’s plan.',
    snack:           'This isn’t part of today’s plan.',
    snacks:          'This isn’t part of today’s plan.',
    'office cake':   'Office cake is not on today’s plan. It will be there next time. You don’t have to be.',
    cake:            'Cake is not part of today’s plan.',
    chocolate:       'Chocolate is not part of today’s plan today.'
  };

  const YES_LINES = [
    'Yes. That’s aligned with 75kg her.',
    'Yes. Protein first — good choice.',
    'Yes. This is part of today’s plan.',
    'Yes. She would eat this intentionally.'
  ];

  function normalize(s) { return (s || '').trim().toLowerCase(); }

  function match(list, q) {
    return list.find(function (item) {
      return q === item || q.indexOf(item) !== -1 || item.indexOf(q) !== -1;
    });
  }

  /* classify(query) -> {verdict:'yes'|'no'|'unknown', title, message, item} */
  function classify(query) {
    const q = normalize(query);
    if (!q) return { verdict: 'unknown', title: 'Tell me what it is', message: 'Type a food and I’ll be honest with you.' , item: query };

    const off = match(OFFPLAN, q);
    if (off) {
      const special = SPECIAL[off] || SPECIAL[q];
      return {
        verdict: 'no',
        item: query,
        title: 'No.',
        message: special || 'This isn’t part of today’s plan.',
        reason: 'Not because you’re not allowed. Because you already decided. 75kg her doesn’t negotiate with herself.'
      };
    }

    const yes = match(ALIGNED, q);
    if (yes) {
      const line = YES_LINES[Math.floor((q.length) % YES_LINES.length)];
      return {
        verdict: 'yes',
        item: query,
        title: 'Yes.',
        message: line,
        reason: 'Eat it slowly. Protein first. Water beside you.'
      };
    }

    // Unknown — give an honest framework rather than a fake certainty.
    return {
      verdict: 'unknown',
      item: query,
      title: 'Let’s be honest about it',
      message: 'It’s not on either list yet.',
      reason: 'Ask 75kg her: is this protein, water, or a whole food? If yes — yes. If it’s sugar, fried, or a snack you didn’t plan — it’s a no.'
    };
  }

  /* The reflective questions before an unplanned craving. */
  const CRAVING_QUESTIONS = [
    { key: 'hungry',    q: 'Are you actually hungry?' },
    { key: 'bored',     q: 'Are you bored?' },
    { key: 'stressed',  q: 'Are you stressed?' },
    { key: 'emotional', q: 'Are you emotional?' },
    { key: 'tired',     q: 'Are you tired?' }
  ];

  /* Gentle, funny quips for when she tries an off-plan food.
     Firm but loving — a wink, never a wound. */
  const JOKES = [
    'Bold of you to test me like this. 😄',
    'That cake and I have never met, and we’d like to keep it that way.',
    'Soda? Your future six-pack just filed a formal complaint. 📝',
    'The office snacks are not your friends — they’re spies for your old habits. 🕵️‍♀️',
    'Ah ah. Even the boiled eggs are side-eyeing you right now. 👀',
    '75kg her just raised one eyebrow. Just the one. That’s all.',
    'Chai. We move — but maybe not towards that one. 🚶‍♀️',
    'This isn’t on the plan, but I love you too much to lie to you. 🤍',
    'Your taste buds voted yes. The plan exercised its veto. 🗳️',
    'Nice try. The answer is still a beautiful, respectful no.',
    'Somewhere, a pear is quietly weeping. 🍐😢',
    'That’s a “future you” problem you don’t have to create today.',
    'Delicious? Probably. On the plan? Absolutely not, my love.',
    'The scale and I had a meeting. This item was not on the agenda.',
    'Abeg. Put it down gently and nobody gets hurt. 😌'
  ];
  function joke() { return JOKES[Math.floor(Math.random() * JOKES.length)]; }

  global.P75 = global.P75 || {};
  global.P75.Food = {
    classify: classify,
    CRAVING_QUESTIONS: CRAVING_QUESTIONS,
    ALIGNED: ALIGNED,
    OFFPLAN: OFFPLAN,
    JOKES: JOKES,
    joke: joke
  };

})(window);
