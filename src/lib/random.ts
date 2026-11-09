import { randomInt } from "crypto";

// A fair, unpredictable whole number in [0, n) — for the random draws the procedures
// ask for (the objects' roles of a batch, part 3.5; Реш. 151). Kept apart from the
// actions, which make up no number anyone relies on as an identifier (0.15).
export const uniformBelow = (n: number): number => randomInt(n);
