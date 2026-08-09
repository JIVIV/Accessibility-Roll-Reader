export const MODULE_ID = 'a11y-roll-reader';

export const SETTINGS = {
	ENABLED: 'enabled',
	ANNOUNCE_ROLLS: 'announceRolls',
	ANNOUNCE_CHAT: 'announceChat',
	ANNOUNCE_OWN: 'announceOwn',
	ANNOUNCE_HIDDEN: 'announceHidden',
	SPEAK_SPEAKER: 'speakSpeaker',
	SPEAK_FORMULA: 'speakFormula',
	SPEAK_DICE: 'speakDice',
	LABEL_WHISPERS: 'labelWhispers',
	VOICE: 'voice',
	RATE: 'rate',
	PITCH: 'pitch',
	VOLUME: 'volume',
	WHISPER_VOLUME: 'whisperVolume',
	DELAY: 'delay',
	GM_HINT_SHOWN: 'gmHintShown',
};

/**
 * Settings a GM is allowed to push to a player's client. Deliberately
 * excludes nothing sensitive — these are all personal comfort options —
 * but keeping an explicit list stops an unexpected payload writing keys
 * that were never meant to be remote-controlled.
 */
export const REMOTE_SETTINGS = [
	SETTINGS.ENABLED,
	SETTINGS.ANNOUNCE_ROLLS,
	SETTINGS.ANNOUNCE_CHAT,
	SETTINGS.ANNOUNCE_OWN,
	SETTINGS.ANNOUNCE_HIDDEN,
	SETTINGS.SPEAK_SPEAKER,
	SETTINGS.SPEAK_FORMULA,
	SETTINGS.SPEAK_DICE,
	SETTINGS.LABEL_WHISPERS,
	SETTINGS.VOICE,
	SETTINGS.RATE,
	SETTINGS.PITCH,
	SETTINGS.VOLUME,
	SETTINGS.WHISPER_VOLUME,
	SETTINGS.DELAY,
];

export const SOCKET = `module.${ MODULE_ID }`;
