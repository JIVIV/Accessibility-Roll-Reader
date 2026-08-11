import { MODULE_ID, SETTINGS } from './constants.js';
import { speech } from './speech.js';
import { describeMessage, isWhisper } from './parser.js';
import { registerSettings, registerKeybindings, populateVoiceChoices, registerPreviewFlush } from './settings.js';
import { openGmPanel, registerSocket, showFirstRunHint } from './gm-control.js';

Hooks.once( 'init', () => {
	registerSettings();
	registerKeybindings();
	registerPreviewFlush();
} );

Hooks.once( 'ready', async () => {
	await speech.initialize();
	populateVoiceChoices();

	// Voices can arrive after startup, so keep the dropdown in step
	// rather than freezing whatever was available at load.
	speech.onVoicesChanged( () => populateVoiceChoices() );

	registerSocket();
	showFirstRunHint();

	if ( game.settings.get( MODULE_ID, SETTINGS.ENABLED ) ) {
		speech.warnIfUnavailable();
	}

	// Expose a small surface for macros and for players who want to
	// wire the controls to something other than the keybindings.
	game.modules.get( MODULE_ID ).api = {
		speak: ( text ) => speech.speak( text, { interrupt: true } ),
		stop: () => speech.stop(),
		repeatLast: () => speech.repeatLast(),
		openGmPanel,
	};
} );

/**
 * Chat commands as a focus-proof alternative to the keybindings.
 *
 * Foundry suppresses keybindings while a text input has focus, which is
 * exactly where a screen reader user tends to be — so Alt+S and Alt+R
 * silently do nothing when the cursor sits in the chat box. Typing a
 * command always works.
 */
Hooks.on( 'chatMessage', ( chatLog, message ) => {
	const command = message.trim().toLowerCase();

	if ( ! command.startsWith( '/read' ) ) {
		return;
	}

	switch ( command ) {
		case '/readstop':
			speech.stop();
			return false;
		case '/readrepeat':
			speech.repeatLast();
			return false;
		case '/readtest':
			speech.speak( game.i18n.localize( `${ MODULE_ID }.speech.preview` ), { interrupt: true } );
			return false;
		default:
			return;
	}
} );

Hooks.on( 'createChatMessage', ( message ) => {
	if ( ! game.settings.get( MODULE_ID, SETTINGS.ENABLED ) || ! speech.available ) {
		return;
	}

	// Messages this user isn't allowed to see must never be spoken —
	// a whisper read aloud would leak it to everyone in the room.
	if ( ! message.visible ) {
		return;
	}

	// ChatMessage#author is current in v13 and v14; #user is the older
	// name, kept as a fallback for messages built by systems or modules
	// that still populate it.
	const authorId = message.author?.id ?? message.user?.id;

	if ( ! game.settings.get( MODULE_ID, SETTINGS.ANNOUNCE_OWN ) && authorId === game.user.id ) {
		return;
	}

	let text = '';

	try {
		text = describeMessage( message );
	} catch ( error ) {
		console.error( `${ MODULE_ID } | Failed to describe chat message`, error, message );
		return;
	}

	if ( ! text ) {
		return;
	}

	// Whispers get their own volume so they can be set apart from
	// public chat by ear rather than only by wording.
	const volume = isWhisper( message )
		? Number( game.settings.get( MODULE_ID, SETTINGS.WHISPER_VOLUME ) )
		: null;

	// Dice So Nice and similar modules animate before revealing the
	// result, so allow the announcement to be held back to match.
	const delay = Number( game.settings.get( MODULE_ID, SETTINGS.DELAY ) ) || 0;

	if ( delay > 0 ) {
		globalThis.setTimeout( () => speech.speak( text, { volume } ), delay * 1000 );
		return;
	}

	speech.speak( text, { volume } );
} );
