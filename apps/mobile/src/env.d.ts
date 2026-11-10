/** Build-time settings Expo inlines into the app (only EXPO_PUBLIC_* names; never secrets). */
declare const process: { readonly env: { readonly EXPO_PUBLIC_API_URL?: string } };
