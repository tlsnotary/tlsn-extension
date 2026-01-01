import { Plugin } from './types';

export const plugins: Record<string, Plugin> = {
    twitter: {
        name: 'Twitter profile Plugin',
        file: '/twitter.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    swissbank: {
        name: 'Swiss Bank Plugin',
        file: '/swissbank.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    spotify: {
        name: 'Spotify Plugin',
        file: '/spotify.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
};
