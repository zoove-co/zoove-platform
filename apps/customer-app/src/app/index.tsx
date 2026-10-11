import { Redirect } from 'expo-router';

// The app opens on the Home tab.
export default function Index() {
  return <Redirect href="/home" />;
}
