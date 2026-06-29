import AppError from '../error/appError';
import Country from '../modules/countery/countery.model';

export const normalizeLocationFields = (payload: Record<string, unknown>) => {
  const country = String(payload.countery || payload.country || '').trim();
  const city = String(payload.city || '').trim();
  const rawLocation = String(payload.location || '').trim();

  let location = rawLocation;
  if (city && country) {
    location = `${city}, ${country}`;
  } else if (!location && city) {
    location = city;
  } else if (!location && country) {
    location = country;
  }

  return { country, city, location };
};

export const validateCityForCountry = async (
  countryName: string,
  cityName: string,
) => {
  const country = countryName.trim();
  const city = cityName.trim();

  if (!country) return;
  if (!city) {
    throw new AppError(400, 'City is required when a country is selected');
  }

  const countryDoc = await Country.findOne({ countryName: country });
  if (!countryDoc) {
    throw new AppError(400, 'Invalid country');
  }

  const configuredCities = (countryDoc.cities ?? [])
    .map((entry) => String(entry.cityName || '').trim())
    .filter(Boolean);

  if (configuredCities.length === 0) return;

  if (!configuredCities.includes(city)) {
    throw new AppError(
      400,
      `${city} is not a valid city for ${country}. Please select a city from the list.`,
    );
  }
};
