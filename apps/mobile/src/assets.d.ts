/** Images bundled with the app (Metro gives each one a numeric asset id). */
declare module '*.png' {
  const asset: number;
  export default asset;
}
declare module '*.jpg' {
  const asset: number;
  export default asset;
}
