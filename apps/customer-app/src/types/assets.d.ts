// Metro turns an imported image into a number or an object that <Image> accepts. TypeScript needs to be told.
declare module '*.jpg' {
  import type { ImageSource } from 'expo-image';
  const source: ImageSource;
  export default source;
}

declare module '*.jpeg' {
  import type { ImageSource } from 'expo-image';
  const source: ImageSource;
  export default source;
}

declare module '*.png' {
  import type { ImageSource } from 'expo-image';
  const source: ImageSource;
  export default source;
}
