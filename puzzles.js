const PUZZLES = [
  {
    id: "nebula-1",
    size: 7,
    endpoints: [
      { color: "red", a: [0, 0], b: [5, 0] },
      { color: "yellow", a: [1, 1], b: [5, 4] },
      { color: "purple", a: [1, 3], b: [4, 3] },
      { color: "cyan", a: [0, 5], b: [2, 6] },
      { color: "pink", a: [3, 5], b: [5, 6] },
      { color: "green", a: [6, 2], b: [6, 6] }
    ]
  },
  {
    id: "nebula-2",
    size: 7,
    endpoints: [
      { color: "red", a: [0, 1], b: [6, 1] },
      { color: "yellow", a: [0, 5], b: [3, 3] },
      { color: "purple", a: [1, 4], b: [5, 5] },
      { color: "cyan", a: [2, 0], b: [2, 6] },
      { color: "pink", a: [4, 0], b: [6, 3] },
      { color: "green", a: [4, 2], b: [6, 6] }
    ]
  },
  {
    id: "nebula-3",
    size: 7,
    endpoints: [
      { color: "red", a: [0, 6], b: [6, 0] },
      { color: "yellow", a: [1, 1], b: [1, 5] },
      { color: "purple", a: [2, 3], b: [5, 3] },
      { color: "cyan", a: [0, 2], b: [4, 6] },
      { color: "pink", a: [3, 0], b: [6, 4] },
      { color: "green", a: [4, 1], b: [6, 6] }
    ]
  }
];

if (typeof window !== "undefined") {
  window.PUZZLES = PUZZLES;
}

if (typeof module !== "undefined") {
  module.exports = PUZZLES;
}
