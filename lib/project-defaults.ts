import type { ProjectInput } from "@/lib/types";

/** New projects start with no unconfirmed business facts. */
export const EMPTY_PROJECT_INPUT: ProjectInput = {
  name: "",
  org: "",
  level: "",
  region: "",
  budget: "",
  domain: "",
  desc: "",
  edge: "",
};
