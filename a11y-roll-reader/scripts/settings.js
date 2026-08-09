import { MODULE_ID, SETTINGS } from './constants.js';
import { speech } from './speech.js';
import { openGmPanel, registerMenu } from './gm-control.js';

/**
 * Where a player's preferences live.
 *
 * 'client' stores in browser localStorage, so settings are lost the
 * moment someone opens a different browser or the desktop app — which
 * for this module means reconfiguring speech every session, exactly the
 * chore it exists to remove. v13 added 'user' scope, stored against the
 * User on the server, so preferences follow the person across devices.
 *
 * @returns {'user'|'client'}
 */
function settingScope() {
	return ( game.release?.generation ?? 0 ) >= 13 ? 'user' : 'client';
}

const bool = ( key, defaultValue, onChange ) => ( {
	name: `${ MODULE_ID }.settings.${ key }.name`,
	hint: `${ MODULE_ID }.settings.${ key }.hint`,
	scope: settingScope(),
	config: true,
	type: Boolean,
	default: defaultValue,
	onChange,
} );

/**
 * Speak a sample whenever a voice setting changes, so someone tuning
 * the rate or picking a voice hears the result immediately instead of
 * having to go and roll dice to find out.
 */
function previewVoice() {
	speech.speak( game.i18n.localize( `${ MODULE_ID }.speech.preview` ), { interrupt: true } );
}

export function registerSettings() {
	// Registered first so the button sits at the top of the module's
	// settings block, where a GM looking for it will actually see it.
	registerMenu();

	// Every setting is per-person, never world-scoped: this is a
	// personal accessibility aid, so one player enabling it must not
	// switch it on for the whole table.
	// Turning it on confirms itself out loud. Someone who cannot see the
	// checkbox needs to hear that it worked, and it doubles as a check
	// that speech is available on this device at all.
	game.settings.register(
		MODULE_ID,
		SETTINGS.ENABLED,
		bool( SETTINGS.ENABLED, false, ( value ) => {
			if ( ! value ) {
				speech.stop();
				return;
			}

			speech.warnIfUnavailable();
			speech.speak( game.i18n.localize( `${ MODULE_ID }.speech.enabled` ), { interrupt: true } );
		} )
	);
	game.settings.register( MODULE_ID, SETTINGS.ANNOUNCE_ROLLS, bool( SETTINGS.ANNOUNCE_ROLLS, true ) );
	game.settings.register( MODULE_ID, SETTINGS.ANNOUNCE_CHAT, bool( SETTINGS.ANNOUNCE_CHAT, true ) );
	game.settings.register( MODULE_ID, SETTINGS.ANNOUNCE_OWN, bool( SETTINGS.ANNOUNCE_OWN, true ) );
	game.settings.register( MODULE_ID, SETTINGS.ANNOUNCE_HIDDEN, bool( SETTINGS.ANNOUNCE_HIDDEN, true ) );
	game.settings.register( MODULE_ID, SETTINGS.SPEAK_SPEAKER, bool( SETTINGS.SPEAK_SPEAKER, true ) );
	game.settings.register( MODULE_ID, SETTINGS.SPEAK_FORMULA, bool( SETTINGS.SPEAK_FORMULA, false ) );
	game.settings.register( MODULE_ID, SETTINGS.SPEAK_DICE, bool( SETTINGS.SPEAK_DICE, false ) );
	game.settings.register( MODULE_ID, SETTINGS.LABEL_WHISPERS, bool( SETTINGS.LABEL_WHISPERS, true ) );

	game.settings.register( MODULE_ID, SETTINGS.VOICE, {
		name: `${ MODULE_ID }.settings.voice.name`,
		hint: `${ MODULE_ID }.settings.voice.hint`,
		scope: settingScope(),
		config: true,
		type: String,
		default: '',
		// On a warm load the browser may already have voices, so seed
		// what we can now; populateVoiceChoices() fills the rest once
		// the async voice list arrives. Values stay as localization
		// keys where applicable — Foundry localizes choice labels when
		// it renders the settings form.
		choices: buildVoiceChoices( globalThis.speechSynthesis?.getVoices?.() ?? [] ),
		onChange: previewVoice,
	} );

	game.settings.register( MODULE_ID, SETTINGS.RATE, {
		name: `${ MODULE_ID }.settings.rate.name`,
		hint: `${ MODULE_ID }.settings.rate.hint`,
		scope: settingScope(),
		config: true,
		type: Number,
		default: 1.1,
		range: { min: 0.5, max: 3, step: 0.1 },
		onChange: previewVoice,
	} );

	game.settings.register( MODULE_ID, SETTINGS.PITCH, {
		name: `${ MODULE_ID }.settings.pitch.name`,
		hint: `${ MODULE_ID }.settings.pitch.hint`,
		scope: settingScope(),
		config: true,
		type: Number,
		default: 1,
		range: { min: 0, max: 2, step: 0.1 },
		onChange: previewVoice,
	} );

	game.settings.register( MODULE_ID, SETTINGS.VOLUME, {
		name: `${ MODULE_ID }.settings.volume.name`,
		hint: `${ MODULE_ID }.settings.volume.hint`,
		scope: settingScope(),
		config: true,
		type: Number,
		default: 1,
		range: { min: 0, max: 1, step: 0.05 },
		onChange: previewVoice,
	} );

	game.settings.register( MODULE_ID, SETTINGS.WHISPER_VOLUME, {
		name: `${ MODULE_ID }.settings.whisperVolume.name`,
		hint: `${ MODULE_ID }.settings.whisperVolume.hint`,
		scope: settingScope(),
		config: true,
		type: Number,
		default: 1,
		range: { min: 0, max: 1, step: 0.05 },
		onChange: ( value ) =>
			speech.speak( game.i18n.localize( `${ MODULE_ID }.speech.whisperPreview` ), {
				interrupt: true,
				volume: value,
			} ),
	} );

	// Not shown in the UI; just remembers whether the GM has been told
	// the panel exists.
	game.settings.register( MODULE_ID, SETTINGS.GM_HINT_SHOWN, {
		scope: settingScope(),
		config: false,
		type: Boolean,
		default: false,
	} );

	game.settings.register( MODULE_ID, SETTINGS.DELAY, {
		name: `${ MODULE_ID }.settings.delay.name`,
		hint: `${ MODULE_ID }.settings.delay.hint`,
		scope: settingScope(),
		config: true,
		type: Number,
		default: 0,
		range: { min: 0, max: 10, step: 0.5 },
	} );
}

/**
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {Record<string, string>}
 */
function buildVoiceChoices( voices ) {
	const choices = { '': `${ MODULE_ID }.settings.voice.default` };

	for ( const voice of voices ?? [] ) {
		choices[ voice.voiceURI ] = `${ voice.name } (${ voice.lang })`;
	}

	return choices;
}

/**
 * Voices aren't available at init, so fill the dropdown once they are.
 * Mutating the registered setting's choices is enough — the config
 * sheet reads them when it renders.
 *
 * This is the only place the module touches Foundry's settings
 * internals, so failure is contained: the dropdown falls back to
 * whatever was seeded at init, and an unrecognised stored voice
 * already degrades to the browser default in SpeechEngine#resolveVoice.
 */
export function populateVoiceChoices() {
	try {
		const setting = game.settings.settings.get( `${ MODULE_ID }.${ SETTINGS.VOICE }` );

		if ( ! setting ) {
			return;
		}

		setting.choices = buildVoiceChoices( speech.voices );
	} catch ( error ) {
		console.warn( `${ MODULE_ID } | Could not populate the voice list; the browser default will be used.`, error );
	}
}

export function registerKeybindings() {
	game.keybindings.register( MODULE_ID, 'stopSpeech', {
		name: `${ MODULE_ID }.keybindings.stopSpeech.name`,
		hint: `${ MODULE_ID }.keybindings.stopSpeech.hint`,
		editable: [ { key: 'KeyS', modifiers: [ 'Alt' ] } ],
		onDown: () => {
			speech.stop();
			return true;
		},
	} );

	game.keybindings.register( MODULE_ID, 'repeatLast', {
		name: `${ MODULE_ID }.keybindings.repeatLast.name`,
		hint: `${ MODULE_ID }.keybindings.repeatLast.hint`,
		editable: [ { key: 'KeyR', modifiers: [ 'Alt' ] } ],
		onDown: () => {
			speech.repeatLast();
			return true;
		},
	} );

	game.keybindings.register( MODULE_ID, 'openGmPanel', {
		name: `${ MODULE_ID }.keybindings.openGmPanel.name`,
		hint: `${ MODULE_ID }.keybindings.openGmPanel.hint`,
		editable: [ { key: 'KeyR', modifiers: [ 'Alt', 'Shift' ] } ],
		restricted: true,
		onDown: () => {
			openGmPanel();
			return true;
		},
	} );
}
