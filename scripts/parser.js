import { MODULE_ID, SETTINGS } from './constants.js';

/**
 * Turns Foundry chat messages into sentences worth hearing.
 *
 * This is the part a screen reader can't do for you. A roll message is
 * a tangle of markup — dice icons, tooltips, part breakdowns, the total
 * repeated in three places — so reading the DOM aloud produces noise.
 * Foundry exposes the underlying Roll objects, so we compose from the
 * data instead of scraping the rendering.
 */

/**
 * Strip markup and collapse whitespace, using the DOM rather than a
 * regex so nested tags and entities resolve correctly.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHtml( html ) {
	if ( ! html ) {
		return '';
	}

	const el = document.createElement( 'div' );
	el.innerHTML = html;

	// Block-level breaks should become sentence gaps, not run words together.
	el.querySelectorAll( 'br, p, div, li, tr' ).forEach( ( node ) => {
		node.append( document.createTextNode( '. ' ) );
	} );

	return ( el.textContent ?? '' )
		.replace( /\s+/g, ' ' )
		.replace( /(\.\s*)+\./g, '.' )
		.trim();
}

/**
 * Dice notation reads badly character by character, so expand the
 * operators into words.
 *
 * @param {string} formula
 * @returns {string}
 */
export function humanizeFormula( formula ) {
	if ( ! formula ) {
		return '';
	}

	return formula
		.replace( /\s+/g, '' )
		.replace( /(\d+)d(\d+)/gi, '$1 d $2' )
		.replace( /\+/g, ' plus ' )
		.replace( /-/g, ' minus ' )
		.replace( /\*/g, ' times ' )
		.replace( /\//g, ' divided by ' )
		.replace( /\s+/g, ' ' )
		.trim();
}

/**
 * Individual die faces, for players who want to hear the dice and not
 * just the total. Discarded results (from keep-highest and similar)
 * are skipped so the spoken list matches what counted.
 *
 * @param {Roll} roll
 * @returns {string}
 */
function describeDice( roll ) {
	const parts = [];

	for ( const term of roll.terms ?? [] ) {
		if ( ! Array.isArray( term.results ) || ! term.faces ) {
			continue;
		}

		const kept = term.results.filter( ( r ) => r.active !== false ).map( ( r ) => r.result );

		if ( ! kept.length ) {
			continue;
		}

		parts.push(
			game.i18n.format( `${ MODULE_ID }.speech.diceGroup`, {
				faces: term.faces,
				results: kept.join( ', ' ),
			} )
		);
	}

	return parts.join( '. ' );
}

/**
 * Compose the spoken form of a roll message.
 *
 * @param {ChatMessage} message
 * @returns {string}
 */
function describeRolls( message ) {
	const speakFormula = game.settings.get( MODULE_ID, SETTINGS.SPEAK_FORMULA );
	const speakDice = game.settings.get( MODULE_ID, SETTINGS.SPEAK_DICE );
	const flavor = stripHtml( message.flavor );
	const rolls = message.rolls ?? [];
	const segments = [];

	for ( const roll of rolls ) {
		const detail = [];

		if ( speakFormula && roll.formula ) {
			detail.push( humanizeFormula( roll.formula ) );
		}

		if ( speakDice ) {
			const dice = describeDice( roll );

			if ( dice ) {
				detail.push( dice );
			}
		}

		const total = game.i18n.format( `${ MODULE_ID }.speech.total`, { total: roll.total } );

		segments.push( detail.length ? `${ detail.join( '. ' ) }. ${ total }` : total );
	}

	const body = segments.join( '. ' );

	return flavor ? `${ flavor }. ${ body }` : body;
}

/**
 * True when the message was whispered to someone.
 *
 * @param {ChatMessage} message
 * @returns {boolean}
 */
export function isWhisper( message ) {
	return ( message.whisper?.length ?? 0 ) > 0;
}

/**
 * Work out how to introduce a message.
 *
 * Sighted players can see at a glance that a message is a private
 * whisper — it is visually distinct in the chat log. Spoken aloud it
 * sounds identical to public chat, so without saying so explicitly a
 * blind player has no way to know a message was private, or that a
 * reply would be seen by the whole table.
 *
 * @param {ChatMessage} message
 * @param {string} speaker Already-resolved speaker name, may be empty.
 * @returns {string}
 */
function attributionFor( message, speaker ) {
	if ( ! isWhisper( message ) || ! game.settings.get( MODULE_ID, SETTINGS.LABEL_WHISPERS ) ) {
		return speaker;
	}

	const recipients = message.whisper ?? [];
	const toMe = recipients.includes( game.user?.id );

	if ( ! speaker ) {
		return game.i18n.localize( `${ MODULE_ID }.speech.whisperPlain` );
	}

	if ( toMe ) {
		return game.i18n.format( `${ MODULE_ID }.speech.whisperToYou`, { speaker } );
	}

	const names = recipients
		.map( ( id ) => game.users?.get( id )?.name )
		.filter( Boolean )
		.join( ', ' );

	return names
		? game.i18n.format( `${ MODULE_ID }.speech.whisperToOthers`, { speaker, targets: names } )
		: game.i18n.format( `${ MODULE_ID }.speech.whisperToYou`, { speaker } );
}

/**
 * Build the full utterance for a message, or an empty string when
 * there is nothing worth speaking.
 *
 * @param {ChatMessage} message
 * @returns {string}
 */
export function describeMessage( message ) {
	const announceRolls = game.settings.get( MODULE_ID, SETTINGS.ANNOUNCE_ROLLS );
	const announceChat = game.settings.get( MODULE_ID, SETTINGS.ANNOUNCE_CHAT );
	const announceHidden = game.settings.get( MODULE_ID, SETTINGS.ANNOUNCE_HIDDEN );
	const speakSpeaker = game.settings.get( MODULE_ID, SETTINGS.SPEAK_SPEAKER );

	const isRoll = message.isRoll ?? ( ( message.rolls?.length ?? 0 ) > 0 );
	const speaker = speakSpeaker ? stripHtml( message.alias ) : '';

	const attribution = attributionFor( message, speaker );

	const withSpeaker = ( body ) => {
		if ( ! body ) {
			return '';
		}

		return attribution
			? game.i18n.format( `${ MODULE_ID }.speech.attributed`, { speaker: attribution, body } )
			: body;
	};

	// Foundry has already worked out whether this user is allowed to
	// see the result, so trust it rather than re-deriving whisper and
	// blind-roll rules here.
	if ( isRoll && ! message.isContentVisible ) {
		if ( ! announceHidden || ! announceRolls ) {
			return '';
		}

		return withSpeaker( game.i18n.localize( `${ MODULE_ID }.speech.hiddenRoll` ) );
	}

	if ( isRoll ) {
		if ( ! announceRolls ) {
			return '';
		}

		return withSpeaker( describeRolls( message ) );
	}

	if ( ! announceChat ) {
		return '';
	}

	const content = stripHtml( message.content );

	return withSpeaker( content );
}
