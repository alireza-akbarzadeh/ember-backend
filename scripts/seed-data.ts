/**
 * Realistic London restaurants for local development.
 *
 * Coordinates are genuine neighbourhood locations so distance sorting produces
 * a believable spread — a search from Shoreditch should surface the Shoreditch
 * places first, not an arbitrary order that hides bugs in the ranking.
 *
 * Ratings are deliberately varied in *both* average and count, so the Bayesian
 * smoothing in `geo.ts` is actually exercised: "Nonna's Kitchen" (4.9 from 8
 * reviews) must not outrank "Bella Napoli" (4.7 from 1,240).
 */

export interface SeedMenuItem {
  name: string;
  description?: string;
  priceCents: number;
  isAvailable?: boolean;
}

export interface SeedCategory {
  name: string;
  sortOrder: number;
  items: SeedMenuItem[];
}

export interface SeedRestaurant {
  name: string;
  description: string;
  addressLine: string;
  city: string;
  phone: string;
  latitude: number;
  longitude: number;
  cuisines: string[];
  priceLevel: number;
  deliveryFeeCents: number;
  minimumOrderCents: number;
  ratingAverage: number;
  ratingCount: number;
  preparationMinutes: number;
  isOpen: boolean;
  categories: SeedCategory[];
}

export const SEED_RESTAURANTS: SeedRestaurant[] = [
  {
    name: 'Bella Napoli',
    description: 'Wood-fired Neapolitan pizza, 60-second bake, dough proved for 48 hours.',
    addressLine: '14 Rivington Street',
    city: 'London',
    phone: '+442071234501',
    latitude: 51.5262,
    longitude: -0.0813,
    cuisines: ['italian', 'pizza'],
    priceLevel: 2,
    deliveryFeeCents: 249,
    minimumOrderCents: 1200,
    ratingAverage: 4.7,
    ratingCount: 1240,
    preparationMinutes: 20,
    isOpen: true,
    categories: [
      {
        name: 'Pizza',
        sortOrder: 0,
        items: [
          {
            name: 'Margherita',
            description: 'San Marzano, fior di latte, basil',
            priceCents: 1050,
          },
          { name: 'Diavola', description: 'Spicy nduja, salami, chilli honey', priceCents: 1390 },
          {
            name: 'Quattro Formaggi',
            description: 'Mozzarella, gorgonzola, taleggio, parmesan',
            priceCents: 1450,
          },
          { name: 'Marinara', description: 'No cheese — tomato, garlic, oregano', priceCents: 890 },
        ],
      },
      {
        name: 'Antipasti',
        sortOrder: 1,
        items: [
          { name: 'Burrata & Tomato', priceCents: 950 },
          { name: 'Arancini (3)', description: 'Ragù and mozzarella', priceCents: 690 },
          { name: 'Garlic Focaccia', priceCents: 550 },
        ],
      },
      {
        name: 'Dolci',
        sortOrder: 2,
        items: [
          { name: 'Tiramisù', priceCents: 720 },
          { name: 'Pistachio Cannoli', priceCents: 640 },
        ],
      },
    ],
  },
  {
    name: 'Sakura Sushi',
    description: 'Omakase-trained chefs, fish flown in four times a week.',
    addressLine: '88 Great Eastern Street',
    city: 'London',
    phone: '+442071234502',
    latitude: 51.5245,
    longitude: -0.0805,
    cuisines: ['japanese', 'sushi', 'asian'],
    priceLevel: 4,
    deliveryFeeCents: 449,
    minimumOrderCents: 2500,
    ratingAverage: 4.8,
    ratingCount: 860,
    preparationMinutes: 30,
    isOpen: true,
    categories: [
      {
        name: 'Nigiri',
        sortOrder: 0,
        items: [
          { name: 'Salmon Nigiri (2)', priceCents: 720 },
          { name: 'Otoro Nigiri (2)', description: 'Fatty bluefin belly', priceCents: 1850 },
          { name: 'Seared Scallop (2)', priceCents: 980 },
        ],
      },
      {
        name: 'Maki',
        sortOrder: 1,
        items: [
          { name: 'Spicy Tuna Roll', priceCents: 1150 },
          { name: 'Dragon Roll', description: 'Eel, avocado, tobiko', priceCents: 1650 },
          { name: 'Cucumber Maki', priceCents: 620 },
        ],
      },
      {
        name: 'Sides',
        sortOrder: 2,
        items: [
          { name: 'Edamame, sea salt', priceCents: 490 },
          { name: 'Miso Soup', priceCents: 380 },
          { name: 'Wakame Salad', priceCents: 560 },
        ],
      },
    ],
  },
  {
    name: 'Smoke & Barrel',
    description: '14-hour hickory smoked brisket, burnt ends on Fridays.',
    addressLine: '23 Kingsland Road',
    city: 'London',
    phone: '+442071234503',
    latitude: 51.5301,
    longitude: -0.0759,
    cuisines: ['american', 'bbq', 'burgers'],
    priceLevel: 3,
    deliveryFeeCents: 349,
    minimumOrderCents: 1500,
    ratingAverage: 4.5,
    ratingCount: 2130,
    preparationMinutes: 35,
    isOpen: true,
    categories: [
      {
        name: 'From the Smoker',
        sortOrder: 0,
        items: [
          { name: 'Brisket Plate', description: '200g, pickles, white bread', priceCents: 1890 },
          { name: 'Half Rack Ribs', priceCents: 1750 },
          { name: 'Burnt Ends', priceCents: 1450, isAvailable: false },
        ],
      },
      {
        name: 'Burgers',
        sortOrder: 1,
        items: [
          {
            name: 'Double Smash',
            description: 'Two patties, cheese, house sauce',
            priceCents: 1290,
          },
          { name: 'Brisket Burger', priceCents: 1590 },
        ],
      },
      {
        name: 'Sides',
        sortOrder: 2,
        items: [
          { name: 'Mac & Cheese', priceCents: 590 },
          { name: 'Slaw', priceCents: 390 },
          { name: 'Dirty Fries', priceCents: 690 },
        ],
      },
    ],
  },
  {
    name: 'Green Bowl',
    description: 'Vegan bowls and cold-pressed juice. Compostable packaging.',
    addressLine: '5 Old Street',
    city: 'London',
    phone: '+442071234504',
    latitude: 51.5254,
    longitude: -0.0876,
    cuisines: ['vegan', 'healthy', 'salads'],
    priceLevel: 2,
    deliveryFeeCents: 0,
    minimumOrderCents: 1000,
    ratingAverage: 4.4,
    ratingCount: 540,
    preparationMinutes: 15,
    isOpen: true,
    categories: [
      {
        name: 'Bowls',
        sortOrder: 0,
        items: [
          { name: 'Miso Sweet Potato Bowl', priceCents: 1150 },
          { name: 'Falafel & Tahini Bowl', priceCents: 1090 },
          { name: 'Teriyaki Tofu Bowl', priceCents: 1190 },
        ],
      },
      {
        name: 'Juices',
        sortOrder: 1,
        items: [
          { name: 'Green Machine', description: 'Kale, apple, ginger, lemon', priceCents: 620 },
          { name: 'Beet Reset', priceCents: 620 },
        ],
      },
    ],
  },
  {
    name: 'Curry Leaf',
    description: 'South Indian home cooking. Dosas made to order.',
    addressLine: '112 Brick Lane',
    city: 'London',
    phone: '+442071234505',
    latitude: 51.5211,
    longitude: -0.0715,
    cuisines: ['indian', 'curry', 'asian'],
    priceLevel: 2,
    deliveryFeeCents: 199,
    minimumOrderCents: 1200,
    ratingAverage: 4.6,
    ratingCount: 1780,
    preparationMinutes: 25,
    isOpen: true,
    categories: [
      {
        name: 'Dosas',
        sortOrder: 0,
        items: [
          { name: 'Masala Dosa', priceCents: 990 },
          { name: 'Ghee Roast Dosa', priceCents: 1090 },
        ],
      },
      {
        name: 'Curries',
        sortOrder: 1,
        items: [
          { name: 'Chicken Chettinad', priceCents: 1390 },
          { name: 'Kerala Fish Curry', priceCents: 1490 },
          { name: 'Chana Masala', priceCents: 1050 },
        ],
      },
      {
        name: 'Breads & Rice',
        sortOrder: 2,
        items: [
          { name: 'Butter Naan', priceCents: 390 },
          { name: 'Lemon Rice', priceCents: 450 },
        ],
      },
    ],
  },
  {
    name: 'Nonna’s Kitchen',
    description: 'Fresh pasta rolled every morning. Twelve covers, tiny menu.',
    addressLine: '7 Exmouth Market',
    city: 'London',
    phone: '+442071234506',
    latitude: 51.5265,
    longitude: -0.1102,
    cuisines: ['italian', 'pasta'],
    priceLevel: 3,
    deliveryFeeCents: 399,
    minimumOrderCents: 1800,
    // High average, almost no reviews — the case that must NOT top the list.
    ratingAverage: 4.9,
    ratingCount: 8,
    preparationMinutes: 30,
    isOpen: true,
    categories: [
      {
        name: 'Pasta',
        sortOrder: 0,
        items: [
          { name: 'Cacio e Pepe', priceCents: 1450 },
          { name: 'Beef Shin Ragù', priceCents: 1690 },
          { name: 'Wild Mushroom Tagliatelle', priceCents: 1590 },
        ],
      },
      {
        name: 'Dolci',
        sortOrder: 1,
        items: [{ name: 'Affogato', priceCents: 590 }],
      },
    ],
  },
  {
    name: 'Taco Libre',
    description: 'Nixtamalised corn tortillas pressed to order.',
    addressLine: '45 Camden High Street',
    city: 'London',
    phone: '+442071234507',
    latitude: 51.5366,
    longitude: -0.1406,
    cuisines: ['mexican', 'tacos'],
    priceLevel: 1,
    deliveryFeeCents: 299,
    minimumOrderCents: 900,
    ratingAverage: 4.3,
    ratingCount: 960,
    preparationMinutes: 18,
    isOpen: true,
    categories: [
      {
        name: 'Tacos',
        sortOrder: 0,
        items: [
          { name: 'Al Pastor (3)', priceCents: 890 },
          { name: 'Baja Fish (3)', priceCents: 990 },
          { name: 'Mushroom & Chipotle (3)', priceCents: 850 },
        ],
      },
      {
        name: 'Sides',
        sortOrder: 1,
        items: [
          { name: 'Guacamole & Chips', priceCents: 590 },
          { name: 'Elote', priceCents: 490 },
        ],
      },
    ],
  },
  {
    name: 'Dragon Wok',
    description: 'Sichuan classics, numbing and unapologetic.',
    addressLine: '19 Gerrard Street',
    city: 'London',
    phone: '+442071234508',
    latitude: 51.5115,
    longitude: -0.1312,
    cuisines: ['chinese', 'asian', 'noodles'],
    priceLevel: 2,
    deliveryFeeCents: 249,
    minimumOrderCents: 1400,
    ratingAverage: 4.2,
    ratingCount: 3120,
    preparationMinutes: 22,
    isOpen: true,
    categories: [
      {
        name: 'Noodles',
        sortOrder: 0,
        items: [
          { name: 'Dan Dan Noodles', priceCents: 1090 },
          { name: 'Beef Chow Fun', priceCents: 1290 },
        ],
      },
      {
        name: 'Wok',
        sortOrder: 1,
        items: [
          { name: 'Mapo Tofu', priceCents: 1150 },
          { name: 'Kung Pao Chicken', priceCents: 1290 },
          { name: 'Dry-Fried Green Beans', priceCents: 890 },
        ],
      },
    ],
  },
  {
    name: 'The Athenian',
    description: 'Charcoal-grilled gyros, tzatziki made daily.',
    addressLine: '61 Upper Street',
    city: 'London',
    phone: '+442071234509',
    latitude: 51.5362,
    longitude: -0.1033,
    cuisines: ['greek', 'mediterranean'],
    priceLevel: 1,
    deliveryFeeCents: 0,
    minimumOrderCents: 1000,
    ratingAverage: 4.1,
    ratingCount: 420,
    preparationMinutes: 16,
    isOpen: false,
    categories: [
      {
        name: 'Gyros',
        sortOrder: 0,
        items: [
          { name: 'Pork Gyros Pita', priceCents: 890 },
          { name: 'Chicken Gyros Pita', priceCents: 890 },
          { name: 'Halloumi Pita', priceCents: 840 },
        ],
      },
      {
        name: 'Sides',
        sortOrder: 1,
        items: [
          { name: 'Greek Fries', priceCents: 450 },
          { name: 'Greek Salad', priceCents: 690 },
        ],
      },
    ],
  },
  {
    name: 'Le Petit Four',
    description: 'Viennoiserie and a very short lunch menu. Sells out by two.',
    addressLine: '3 Marylebone Lane',
    city: 'London',
    phone: '+442071234510',
    latitude: 51.5163,
    longitude: -0.1503,
    cuisines: ['french', 'bakery', 'breakfast'],
    priceLevel: 3,
    deliveryFeeCents: 349,
    minimumOrderCents: 800,
    // Solid average with almost no reviews — smoothing should hold it below
    // the well-reviewed 4.5s until more come in.
    ratingAverage: 4.8,
    ratingCount: 15,
    preparationMinutes: 12,
    isOpen: true,
    categories: [
      {
        name: 'Pâtisserie',
        sortOrder: 0,
        items: [
          { name: 'Croissant', priceCents: 380 },
          { name: 'Pain au Chocolat', priceCents: 420 },
          { name: 'Canelé (2)', priceCents: 550 },
        ],
      },
      {
        name: 'Lunch',
        sortOrder: 1,
        items: [
          { name: 'Croque Monsieur', priceCents: 1090 },
          { name: 'Quiche Lorraine', priceCents: 950 },
        ],
      },
    ],
  },
];

/** Saved addresses for the seeded customer, spread across the city. */
export const SEED_ADDRESSES = [
  {
    label: 'Home',
    line1: '31 Rivington Street',
    city: 'London',
    postalCode: 'EC2A 3QQ',
    latitude: 51.5259,
    longitude: -0.0805,
    isDefault: true,
  },
  {
    label: 'Work',
    line1: '1 Canada Square',
    city: 'London',
    postalCode: 'E14 5AB',
    latitude: 51.5049,
    longitude: -0.0195,
    isDefault: false,
  },
];
