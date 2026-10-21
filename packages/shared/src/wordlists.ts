/**
 * 40 word triplets for delayed recall. Concrete 1-2 syllable nouns, hand-curated groups
 * (one nature word, one small object, one place per triplet) so there is no semantic overlap
 * inside a triplet. Words avoid the fluency categories (animals, fruit, kitchen, clothes, tools...).
 * Triplet 0 is the demo triplet used in the spec examples.
 */
export const WORD_TRIPLETS: ReadonlyArray<readonly [string, string, string]> = [
  ["apple","candle","river"],
  ["meadow","basket","market"],
  ["thunder","clock","stairs"],
  ["mountain","postcard","garden"],
  ["forest","purse","inn"],
  ["valley","soap","cottage"],
  ["lake","toy","doorway"],
  ["pebble","letter","plaza"],
  ["sunset","kite","chapel"],
  ["cloud","tent","roof"],
  ["canyon","marble","farm"],
  ["rainbow","paper","cabin"],
  ["snow","pencil","village"],
  ["wind","key","window"],
  ["fog","suitcase","alley"],
  ["storm","wallet","school"],
  ["moon","trophy","wall"],
  ["star","card","path"],
  ["ocean","anchor","shed"],
  ["wave","rope","castle"],
  ["shore","crayon","chimney"],
  ["sand","compass","street"],
  ["rock","string","church"],
  ["hill","button","gate"],
  ["cliff","coin","road"],
  ["cave","ticket","mill"],
  ["field","crown","tower"],
  ["pond","quilt","hallway"],
  ["creek","photo","yard"],
  ["dune","blanket","barn"],
  ["willow","bucket","porch"],
  ["maple","notebook","tunnel"],
  ["cedar","map","pier"],
  ["pine","comb","station"],
  ["oak","ribbon","attic"],
  ["cactus","stamp","orchard"],
  ["grass","flag","bridge"],
  ["leaf","medal","dock"],
  ["branch","diary","fence"],
  ["acorn","chalk","park"],
];
export const TRIPLET_COUNT = WORD_TRIPLETS.length;
