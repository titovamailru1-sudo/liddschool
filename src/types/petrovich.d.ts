declare module "petrovich" {
  type Case = "genitive" | "dative" | "accusative" | "instrumental" | "prepositional";
  type Gender = "male" | "female" | "androgynous";
  type Inflect = Record<Case, (name: string) => string>;
  type GenderRules = { first: Inflect; middle: Inflect; last: Inflect };

  interface Person {
    gender?: Gender;
    first?: string;
    middle?: string;
    last?: string;
  }

  interface Petrovich {
    (person: Person, gcase: Case): Required<Pick<Person, "gender">> & Person;
    detect_gender(middle: string): Gender;
    male: GenderRules;
    female: GenderRules;
    androgynous: GenderRules;
  }

  const petrovich: Petrovich;
  export default petrovich;
}
