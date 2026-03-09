import { Plugin } from './types';

export const plugins: Record<string, Plugin> = {
    twitter: {
        name: 'Twitter Profile',
        description: 'Prove your Twitter profile information with cryptographic verification',
        logo: '𝕏',
        file: '/plugins/twitter.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    swissbank: {
        name: 'Swiss Bank',
        description: 'Verify your Swiss bank account balance securely and privately. (Login: admin / admin)',
        logo: '🏦',
        file: '/plugins/swissbank.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    spotify: {
        name: 'Spotify',
        description: 'Prove your Spotify listening history and music preferences',
        logo: '🎵',
        file: '/plugins/spotify.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    duolingo: {
        name: 'Duolingo',
        description: 'Prove your Duolingo language learning progress and achievements',
        logo: '🦉',
        file: '/plugins/duolingo.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    uber: {
        name: 'Uber Profile',
        description: 'Prove your Uber rider profile via GraphQL POST request',
        logo: '🚗',
        file: '/plugins/uber.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
};
