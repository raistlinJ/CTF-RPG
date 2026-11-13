// Walkable footprints refined against the rendered cutaway artwork.
// Coordinates use the existing 40×28 grid; wall fronts and furniture are solid.
export const expansionMaps=[
  {
    "id": "latverian-offices",
    "name": "Latverian Office Wing",
    "image": "latverian-offices-v1",
    "floor": "#394f55",
    "music": "winter-dominion.mid",
    "rooms": [
      [
        3,
        5,
        12,
        3
      ],
      [
        25,
        5,
        12,
        3
      ],
      [
        3,
        18,
        12,
        4
      ],
      [
        25,
        18,
        12,
        4
      ]
    ],
    "corridors": [
      [
        2,
        12,
        36,
        2
      ],
      [
        18,
        3,
        4,
        21
      ],
      [
        10,
        7,
        3,
        6
      ],
      [
        27,
        7,
        3,
        6
      ],
      [
        10,
        13,
        3,
        6
      ],
      [
        27,
        13,
        3,
        6
      ]
    ],
    "furniture": [
      [
        5,
        5,
        4,
        2
      ],
      [
        26,
        5,
        3,
        2
      ],
      [
        34,
        5,
        2,
        2
      ],
      [
        32,
        6,
        1,
        1
      ],
      [
        4,
        19,
        7,
        2
      ],
      [
        28,
        19,
        6,
        2
      ],
      [
        4,
        18,
        4,
        1
      ],
      [
        13,
        18,
        2,
        2
      ]
    ],
    "description": "A Latverian winter office headquarters with a reception lobby, an executive office at upper left, a records office at upper right, a staff workroom at lower left and a conference room at lower right. Rich green carpets, dark oak desks, brass desk lamps, filing cabinets, vintage computer terminals, gift parcels and modest pine garlands. The main horizontal hallway runs left to right, with a central vertical hall and four clear side-room doorways. A northern lift doorway leads to the orbital station."
  },
  {
    "id": "orbital-station",
    "name": "Orbital Gift Station",
    "image": "orbital-gift-station-v1",
    "floor": "#344853",
    "music": "iron-and-mistletoe.mid",
    "rooms": [
      [
        3,
        5,
        9,
        4
      ],
      [
        28,
        5,
        10,
        4
      ],
      [
        3,
        19,
        9,
        3
      ],
      [
        28,
        18,
        10,
        4
      ],
      [
        15,
        11,
        10,
        4
      ]
    ],
    "corridors": [
      [
        3,
        12,
        35,
        2
      ],
      [
        18,
        3,
        4,
        21
      ],
      [
        7,
        8,
        3,
        5
      ],
      [
        30,
        8,
        3,
        5
      ],
      [
        7,
        13,
        3,
        7
      ],
      [
        30,
        13,
        3,
        7
      ]
    ],
    "furniture": [
      [
        3,
        5,
        4,
        1
      ],
      [
        7,
        5,
        4,
        2
      ],
      [
        29,
        5,
        5,
        2
      ],
      [
        35,
        5,
        2,
        1
      ],
      [
        3,
        19,
        4,
        2
      ],
      [
        10,
        19,
        2,
        2
      ],
      [
        29,
        19,
        5,
        2
      ],
      [
        35,
        19,
        2,
        2
      ]
    ],
    "description": "A holiday orbital space station above a blue planet, floating in a starfield. Cutaway pressure hull and layered bulkhead wall fronts reveal a central junction, upper-left command bridge, upper-right observation room, lower-left cargo bay and lower-right reactor room. Silver-blue deck plates, amber strip lights, cyan consoles, round windows into space, carefully stacked presents and tiny strings of holiday lights. Horizontal and vertical corridors join five chambers through obvious open airlock doorways. The top central airlock leads into a castle gateway."
  },
  {
    "id": "castle-corridors",
    "name": "Castle Doom: The Secret Galleries",
    "image": "castle-secret-galleries-v1",
    "floor": "#47504a",
    "music": "iron-and-mistletoe.mid",
    "rooms": [
      [
        14,
        4,
        12,
        3
      ],
      [
        3,
        4,
        9,
        3
      ],
      [
        28,
        4,
        9,
        3
      ],
      [
        3,
        18,
        9,
        4
      ],
      [
        28,
        18,
        9,
        4
      ]
    ],
    "corridors": [
      [
        3,
        12,
        34,
        2
      ],
      [
        18,
        6,
        4,
        18
      ],
      [
        7,
        6,
        3,
        7
      ],
      [
        30,
        6,
        3,
        7
      ],
      [
        7,
        13,
        3,
        6
      ],
      [
        30,
        13,
        3,
        6
      ]
    ],
    "furniture": [
      [
        4,
        4,
        3,
        2
      ],
      [
        33,
        4,
        3,
        2
      ],
      [
        4,
        19,
        3,
        2
      ],
      [
        31,
        19,
        4,
        2
      ],
      [
        15,
        4,
        3,
        2
      ]
    ],
    "description": "A secret wing of Castle Doom in a snowy holiday night. A northern throne antechamber, upper-left candlelit library, upper-right armory, lower-left vaulted treasury and lower-right feast preparation chamber are linked by a broad east-west gallery and narrow north-south passages. Emerald banners, silver suits of armor, stone arches, iron-banded open doors, red ribbons, torches and snowy windows. Layered stone wall fronts and cutaway corners make each side room feel like a place to enter and leave. Furniture stays in the marked solid blocks; all hallways and door thresholds remain clear."
  }
];
export function expansionGround(map){
 const cells=new Map();
 for(const[x,y,w,h]of [...map.rooms,...map.corridors])for(let b=y;b<y+h;b++)for(let a=x;a<x+w;a++)cells.set(`${a},${b}`,[a,b]);
 for(const[x,y,w,h]of map.furniture)for(let b=y;b<y+h;b++)for(let a=x;a<x+w;a++)cells.delete(`${a},${b}`);
 return [...cells.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
}

export const expansionCast=[
  {
    "id": "beta-ray-bill",
    "name": "Beta Ray Bill",
    "role": "hero",
    "map": "latverian-offices",
    "x": 10,
    "y": 6,
    "subtitle": "An interstellar ally on holiday office duty.",
    "greeting": "Stormbreaker is ready. The paperwork, I am told, must be handled more delicately.",
    "advice": "The main hallway goes left and right. Follow the upper central passage to the orbital lift. Side rooms contain desks and records you can use for new challenges."
  },
  {
    "id": "rocket-raccoon",
    "name": "Rocket Raccoon",
    "role": "hero",
    "map": "latverian-offices",
    "x": 30,
    "y": 6,
    "subtitle": "Every office terminal could use a few upgrades.",
    "greeting": "Nice filing system. I could automate it, but Doom keeps rejecting my equipment budget.",
    "advice": "Walk through the open doorways into each office. The desks are solid, so go around them rather than through them."
  },
  {
    "id": "moon-knight",
    "name": "Moon Knight",
    "role": "hero",
    "map": "castle-corridors",
    "x": 8,
    "y": 5,
    "subtitle": "A moonlit watch through the secret galleries.",
    "greeting": "The castle is quiet tonight. That makes the footsteps in the next gallery easier to hear.",
    "advice": "The east-west gallery connects the study and armory. Lower passages lead to the treasury and feast chamber; the northern hall opens into the antechamber."
  },
  {
    "id": "hercules",
    "name": "Hercules",
    "role": "hero",
    "map": "orbital-station",
    "x": 5,
    "y": 7,
    "subtitle": "Olympian strength meets orbital holiday logistics.",
    "greeting": "A station among the stars! A worthy place for a holiday feast, once we clear these gift crates.",
    "advice": "A central junction connects the bridge, observation room, cargo bay, and reactor room. Follow the illuminated corridors and open airlocks."
  },
  {
    "id": "silver-surfer",
    "name": "Silver Surfer",
    "role": "hero",
    "map": "orbital-station",
    "x": 34,
    "y": 7,
    "subtitle": "Holiday starlight across the orbital sky.",
    "greeting": "Even among the stars, a small act of kindness can illuminate a world.",
    "advice": "The northern central airlock reaches Castle Doom’s secret galleries. Return to the station’s arrival doorway to go back to the office wing."
  },
  {
    "id": "green-goblin",
    "name": "Green Goblin",
    "role": "villain",
    "map": "castle-corridors",
    "x": 31,
    "y": 5,
    "subtitle": "An ornament with a suspiciously theatrical grin.",
    "greeting": "Doom invited me to decorate. Apparently he meant ribbons, and absolutely nothing that flies.",
    "advice": "The walls are real, even when my directions are questionable. Follow the lit floor through an open doorway to enter a side room."
  },
  {
    "id": "dormammu",
    "name": "Dormammu",
    "role": "villain",
    "map": "orbital-station",
    "x": 35,
    "y": 21,
    "subtitle": "A small snow globe from a very large dimension.",
    "greeting": "I came to bargain for a quieter holiday. Doom offered me reactor maintenance.",
    "advice": "This lower chamber is reached through a short corridor from the main junction. Return the same way; the outer hull is not a shortcut."
  },
  {
    "id": "ultron",
    "name": "Ultron",
    "role": "villain",
    "map": "orbital-station",
    "x": 8,
    "y": 20,
    "subtitle": "The gift inventory has acquired an alarming efficiency.",
    "greeting": "SEASONAL INVENTORY: COMPLETE. HUMAN PAPERWORK: STILL INEFFICIENT.",
    "advice": "The cargo bay connects to the central corridor through its upper doorway. Solid consoles and bulkheads cannot be stepped through."
  },
  {
    "id": "doctor-octopus",
    "name": "Doctor Octopus",
    "role": "villain",
    "map": "latverian-offices",
    "x": 12,
    "y": 19,
    "subtitle": "Four extra hands for the holiday filing backlog.",
    "greeting": "Four mechanical arms, and I am still expected to sort the gift forms alphabetically.",
    "advice": "The lower-left workroom opens onto the main hallway. The reception entrance is down the central passage; the space lift is at the north end."
  },
  {
    "id": "taskmaster",
    "name": "Taskmaster",
    "role": "villain",
    "map": "latverian-offices",
    "x": 35,
    "y": 19,
    "subtitle": "Every holiday meeting needs a tactical agenda.",
    "greeting": "I memorized every move in the holiday training drill. Nobody warned me about the budget meeting.",
    "advice": "This conference room is a real room, not an illusion. Use its open upper doorway to reach the hallway and the other offices."
  }
];
