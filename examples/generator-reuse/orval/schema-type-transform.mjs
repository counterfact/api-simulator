import { orvalTransform } from "counterfact";

// Orval writes a barrel for its local schema files. The tsconfig alias points
// there from every depth in Counterfact's generated type tree.
export default orvalTransform({ moduleSpecifier: "#orval-models" });
