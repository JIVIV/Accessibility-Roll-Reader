/* eslint-disable no-undef */
import { MODULE_ID, SETTINGS, REMOTE_SETTINGS, SOCKET } from './constants.js';
import { speech } from './speech.js';

/**
 * Lets the GM configure a player's speech settings for them.
 *
 * The reason this exists: the player most likely to need this module is
 * also the player most likely to struggle with Foundry's settings UI,
 * which is a dense nest of nested menus and sliders. Asking someone to
 * navigate that unaided in order to switch on the tool that would help
 * them navigate is backwards. So the GM can set it up on their behalf.
 *
 * Client-scoped settings can only be written by the client that owns
 * them, so this is a request over the socket rather than a direct
 * write, and the player's own client applies it and says so out loud.
 */

const NUMERIC = new Set( [ SETTINGS.RATE, SETTINGS.PITCH, SETTINGS.VOLUME, SETTINGS.WHISPER_VOLUME, SETTINGS.DELAY ] );

const BOOLEAN = new Set( [
	SETTINGS.ENABLED,
	SETTINGS.ANNOUNCE_ROLLS,
	SETTINGS.ANNOUNCE_CHAT,
	SETTINGS.ANNOUNCE_OWN,
	SETTINGS.ANNOUNCE_HIDDEN,
	SETTINGS.SPEAK_SPEAKER,
	SETTINGS.SPEAK_FORMULA,
	SETTINGS.SPEAK_DICE,
	SETTINGS.LABEL_WHISPERS,
] );

const t = ( key ) => game.i18n.localize( `${ MODULE_ID }.${ key }` );

function escapeHtml( value ) {
	const el = document.createElement( 'div' );
	el.textContent = String( value ?? '' );
	return el.innerHTML;
}

function buildForm() {
	const players = game.users.filter( ( u ) => u.active && u.id !== game.user.id );

	if ( ! players.length ) {
		return null;
	}

	const playerOptions = players
		.map( ( u ) => `<option value="${ escapeHtml( u.id ) }">${ escapeHtml( u.name ) }</option>` )
		.join( '' );

	const voiceOptions = [ `<option value="">${ escapeHtml( t( 'settings.voice.default' ) ) }</option>` ]
		.concat(
			speech.voices.map(
				( v ) => `<option value="${ escapeHtml( v.voiceURI ) }">${ escapeHtml( `${ v.name } (${ v.lang })` ) }</option>`
			)
		)
		.join( '' );

	// Foundry expects fields inside a .form-fields wrapper; without it
	// labels and inputs do not share a row properly.
	const row = ( labelText, field ) => `
		<div class="form-group">
			<label>${ escapeHtml( labelText ) }</label>
			<div class="form-fields">${ field }</div>
		</div>`;

	const checkbox = ( key, checked ) =>
		row(
			t( `settings.${ key }.name` ),
			`<input type="checkbox" name="${ key }" ${ checked ? 'checked' : '' }>`
		);

	const number = ( key, min, max, step, value ) =>
		row(
			t( `settings.${ key }.name` ),
			`<input type="number" name="${ key }" min="${ min }" max="${ max }" step="${ step }" value="${ value }">`
		);

	// A div, not a form: DialogV2 already wraps content in its own
	// <form>, and nesting forms is invalid HTML — the browser silently
	// drops the inner one, taking the submit wiring with it.
	return `
		<div class="wpr-gm-panel">
			<p class="notes">${ escapeHtml( t( 'gm.intro' ) ) }</p>

			<fieldset>
				<legend>${ escapeHtml( t( 'gm.player' ) ) }</legend>
				${ row( t( 'gm.player' ), `<select name="__target">${ playerOptions }</select>` ) }
			</fieldset>

			<fieldset>
				<legend>${ escapeHtml( t( 'gm.groupAnnounce' ) ) }</legend>
				${ checkbox( SETTINGS.ENABLED, true ) }
				${ checkbox( SETTINGS.ANNOUNCE_ROLLS, true ) }
				${ checkbox( SETTINGS.ANNOUNCE_CHAT, true ) }
				${ checkbox( SETTINGS.ANNOUNCE_OWN, true ) }
				${ checkbox( SETTINGS.ANNOUNCE_HIDDEN, true ) }
				${ checkbox( SETTINGS.SPEAK_SPEAKER, true ) }
				${ checkbox( SETTINGS.LABEL_WHISPERS, true ) }
				${ checkbox( SETTINGS.SPEAK_FORMULA, false ) }
				${ checkbox( SETTINGS.SPEAK_DICE, false ) }
			</fieldset>

			<fieldset>
				<legend>${ escapeHtml( t( 'gm.groupVoice' ) ) }</legend>
				${ row( t( 'settings.voice.name' ), `<select name="${ SETTINGS.VOICE }">${ voiceOptions }</select>` ) }
				${ number( SETTINGS.RATE, 0.5, 3, 0.1, 1.1 ) }
				${ number( SETTINGS.PITCH, 0, 2, 0.1, 1 ) }
				${ number( SETTINGS.VOLUME, 0, 1, 0.05, 1 ) }
				${ number( SETTINGS.WHISPER_VOLUME, 0, 1, 0.05, 1 ) }
				${ number( SETTINGS.DELAY, 0, 10, 0.5, 0 ) }
				<p class="notes">${ escapeHtml( t( 'gm.voiceNote' ) ) }</p>
			</fieldset>
		</form>`;
}

/**
 * Read the submitted form into a settings payload.
 *
 * @param {HTMLFormElement} form
 * @returns {{ targetUserId: string, settings: Record<string, unknown> }}
 */
function readForm( form ) {
	const data = new FormData( form );
	const targetUserId = String( data.get( '__target' ) ?? '' );
	const settings = {};

	for ( const key of REMOTE_SETTINGS ) {
		if ( BOOLEAN.has( key ) ) {
			settings[ key ] = form.elements[ key ]?.checked ?? false;
			continue;
		}

		const raw = data.get( key );

		if ( raw === null ) {
			continue;
		}

		settings[ key ] = NUMERIC.has( key ) ? Number( raw ) : String( raw );
	}

	return { targetUserId, settings };
}

export async function openGmPanel() {
	if ( ! game.user.isGM ) {
		return;
	}

	const content = buildForm();

	if ( ! content ) {
		ui.notifications?.warn( t( 'gm.noPlayers' ) );
		return;
	}

	await foundry.applications.api.DialogV2.prompt( {
		// Foundry's default dialog is too narrow for these labels, and
		// without an explicit size the content overflows and pushes the
		// submit button out of reach.
		window: { title: t( 'gm.title' ), resizable: true },
		position: { width: 540 },
		content,
		ok: {
			label: t( 'gm.apply' ),
			callback: ( _event, button ) => {
				const { targetUserId, settings } = readForm( button.form );

				if ( ! targetUserId ) {
					return;
				}

				game.socket.emit( SOCKET, {
					action: 'applySettings',
					senderId: game.user.id,
					targetUserId,
					settings,
				} );

				ui.notifications?.info(
					game.i18n.format( `${ MODULE_ID }.gm.sent`, {
						player: game.users.get( targetUserId )?.name ?? targetUserId,
					} )
				);
			},
		},
	} );
}

/**
 * Puts a button in Module Settings that opens the panel.
 *
 * A keyboard shortcut nobody knows about is not a feature, and the GM
 * setting this up for a player has no reason to have read the readme.
 * Foundry's registerMenu wants an Application class, but we only want
 * a button that opens a dialog, so this subclass replaces render()
 * rather than building a window of its own.
 */
function buildMenuClass() {
	const Base = foundry?.applications?.api?.ApplicationV2;

	if ( ! Base ) {
		return null;
	}

	return class GmPanelMenu extends Base {
		static DEFAULT_OPTIONS = { id: `${ MODULE_ID }-gm-menu` };

		async render() {
			await openGmPanel();
			return this;
		}
	};
}

export function registerMenu() {
	// Guarded: if a future Foundry version changes how menus are
	// registered, the keybinding and API still work, so a failure here
	// should cost discoverability and nothing else.
	try {
		const cls = buildMenuClass();

		if ( ! cls ) {
			return;
		}

		game.settings.registerMenu( MODULE_ID, 'gmPanel', {
			name: `${ MODULE_ID }.gm.menuName`,
			label: `${ MODULE_ID }.gm.menuLabel`,
			hint: `${ MODULE_ID }.gm.menuHint`,
			icon: 'fas fa-volume-high',
			type: cls,
			restricted: true,
		} );
	} catch ( error ) {
		console.warn( `${ MODULE_ID } | Could not register the GM settings menu; use the keybinding instead.`, error );
	}
}

/**
 * Tell the GM once, on first load, that the panel exists. Without this
 * the feature is invisible unless they happen to read the settings
 * list or the keybindings screen.
 */
export function showFirstRunHint() {
	if ( ! game.user.isGM || game.settings.get( MODULE_ID, SETTINGS.GM_HINT_SHOWN ) ) {
		return;
	}

	ui.notifications?.info( t( 'gm.firstRun' ), { permanent: true } );
	game.settings.set( MODULE_ID, SETTINGS.GM_HINT_SHOWN, true );
}

export function registerSocket() {
	game.socket.on( SOCKET, async ( data ) => {
		if ( data?.action !== 'applySettings' || data.targetUserId !== game.user.id ) {
			return;
		}

		// Only a GM may reconfigure someone else's client.
		if ( ! game.users.get( data.senderId )?.isGM ) {
			return;
		}

		for ( const [ key, value ] of Object.entries( data.settings ?? {} ) ) {
			if ( ! REMOTE_SETTINGS.includes( key ) ) {
				continue;
			}

			try {
				await game.settings.set( MODULE_ID, key, value );
			} catch ( error ) {
				console.warn( `${ MODULE_ID } | Could not apply remote setting "${ key }"`, error );
			}
		}

		// Say so out loud: the player this feature exists for cannot
		// see a notification banner.
		speech.speak( t( 'speech.settingsUpdated' ), { interrupt: true } );
		ui.notifications?.info( t( 'speech.settingsUpdated' ) );
	} );
}
