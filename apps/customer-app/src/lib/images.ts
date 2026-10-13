import type { ImageSourcePropType } from 'react-native';

import bannerBookForYou from '../../assets/zoove/banners/book-for-you.jpg';
import bannerFlexible from '../../assets/zoove/banners/flexible-scheduling.jpg';
import bannerMixFormat from '../../assets/zoove/banners/mix-format.jpg';
import bannerParty from '../../assets/zoove/banners/party.jpg';
import bannerSwapFormat from '../../assets/zoove/banners/swap-format.jpg';
import demoTrainerPhoto from '../../assets/zoove/demo-trainer.jpg';
import academyCertified from '../../assets/zoove/academy/certified.jpg';
import academyPrograms from '../../assets/zoove/academy/programs.jpg';
import academyVerified from '../../assets/zoove/academy/verified.jpg';
import bollywoodMix from '../../assets/zoove/formats/bollywood-mix.jpg';
import corePilates from '../../assets/zoove/formats/core-pilates.jpg';
import danceCardio from '../../assets/zoove/formats/dance-cardio.jpg';
import functionalStrength from '../../assets/zoove/formats/functional-strength.jpg';
import hathaYoga from '../../assets/zoove/formats/hatha-yoga.jpg';
import matPilates from '../../assets/zoove/formats/mat-pilates.jpg';
import mobilityPilates from '../../assets/zoove/formats/mobility-pilates.jpg';
import mobilityStrength from '../../assets/zoove/formats/mobility-strength.jpg';
import powerYoga from '../../assets/zoove/formats/power-yoga.jpg';
import strengthTraining from '../../assets/zoove/formats/strength-training.jpg';
import vinyasaYoga from '../../assets/zoove/formats/vinyasa-yoga.jpg';
import zumbaClass from '../../assets/zoove/formats/zumba.jpg';
import logo from '../../assets/zoove/logo.png';
import participantDuo from '../../assets/zoove/participants/duo.jpg';
import participantGroup from '../../assets/zoove/participants/group.jpg';
import participantLovedOne from '../../assets/zoove/participants/loved-one.jpg';
import participantYou from '../../assets/zoove/participants/you.jpg';
import servicePilates from '../../assets/zoove/services/pilates.jpg';
import serviceStrength from '../../assets/zoove/services/strength.jpg';
import serviceYoga from '../../assets/zoove/services/yoga.jpg';
import serviceZumba from '../../assets/zoove/services/zumba.jpg';

// All artwork comes from Pratik's prototype (Drive: Zoove Prototype Images Repository). Files are
// resized for mobile. Later, banners and tiles should be served by the admin panel (decision D13);
// the keys below stay the same, so only this file changes.

export const logoImage: ImageSourcePropType = logo;
export const demoTrainerImage: ImageSourcePropType = demoTrainerPhoto;

// Keyed by service slug.
export const serviceImages: Partial<Record<string, ImageSourcePropType>> = {
  yoga: serviceYoga,
  strength: serviceStrength,
  pilates: servicePilates,
  zumba: serviceZumba,
};

// Keyed by format slug (the styles inside a service).
export const formatImages: Partial<Record<string, ImageSourcePropType>> = {
  'power-yoga': powerYoga,
  'vinyasa-yoga': vinyasaYoga,
  'hatha-yoga': hathaYoga,
  'strength-training': strengthTraining,
  'functional-strength': functionalStrength,
  'mobility-strength': mobilityStrength,
  'mat-pilates': matPilates,
  'core-pilates': corePilates,
  'mobility-pilates': mobilityPilates,
  zumba: zumbaClass,
  'bollywood-mix': bollywoodMix,
  'dance-cardio': danceCardio,
};

export const participantImages = {
  personal: participantYou,
  duo: participantDuo,
  loved_one: participantLovedOne,
  group: participantGroup,
} as const;

export const academyImages = {
  certified: academyCertified,
  programs: academyPrograms,
  verified: academyVerified,
} as const;

export const bannerImages = {
  bookForYou: bannerBookForYou,
  mixFormat: bannerMixFormat,
  swapFormat: bannerSwapFormat,
  flexible: bannerFlexible,
  party: bannerParty,
} as const;
