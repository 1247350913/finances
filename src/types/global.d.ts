// File Types

// Plain CSS imports
// declare module "*.css";

// Raw text imports (import foo from "./file?raw")
declare module "*?raw" {
  const content: string;
  export default content;
}

// CSS Modules
// declare module "*.module.css" {
//   const classes: { [key: string]: string };
//   export default classes;
// }

// Images
// declare module "*.jpg" {
//   const src: string;
//   export default src;
// }
// declare module "*.jpeg" {
//   const src: string;
//   export default src;
// }
// declare module "*.png" {
//   const src: string;
//   export default src;
// }
// declare module "*.svg" {
//   const src: string;
//   export default src;
// }
