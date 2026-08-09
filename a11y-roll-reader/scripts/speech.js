import { MODULE_ID, SETTINGS } from './constants.js';

/**
 * How long to let speechSynthesis.cancel() settle before speaking the
 * replacement. Long enough for engines that flush the queue on a later
 * task, short enough not to feel laggy.
 */
const INTERRUPT_SETTLE_MS = 100;

/**
 * Thin wrapper around the browser's SpeechSynthesis API.
 *
 * Deliberately uses the built-in engine rather than a hosted service:
 * it is free, works offline, needs no API key, and this module must not
 * put a paywall between a blind player and the game.
 */
class SpeechEngine {
	constructor() {
		this.available = false;
		this.voices = [];
		this.lastSpoken = '';
		this.lastVolume = null;
		this._queue = [];
		this._speaking = false;
		this._warned = false;
		this._lifecycleBound = false;
	}

	get synth() {
		return globalThis.speechSynthesis ?? null;
	}

	/**
	 * Voices populate asynchronously in most browsers, and on a cold
	 * load getVoices() returns an empty list until 'voiceschanged'
	 * fires. Resolve once we actually have some, with a timeout so a
	 * browser that never fires the event doesn't hang startup.
	 *
	 * @returns {Promise<SpeechSynthesisVoice[]>}
	 */
	async loadVoices( timeoutMs = 3000 ) {
		if ( ! this.synth ) {
			return [];
		}

		const existing = this.synth.getVoices();

		if ( existing.length ) {
			this.voices = existing;
			return this.voices;
		}

		this.voices = await new Promise( ( resolve ) => {
			let settled = false;

			const finish = () => {
				if ( settled ) {
					return;
				}
				settled = true;
				resolve( this.synth.getVoices() ?? [] );
			};

			this.synth.addEventListener( 'voiceschanged', finish, { once: true } );
			globalThis.setTimeout( finish, timeoutMs );
		} );

		return this.voices;
	}

	async initialize() {
		this.available = !! this.synth;

		if ( ! this.available ) {
			return false;
		}

		await this.loadVoices();
		this.registerLifecycleHandlers();
		return true;
	}

	/**
	 * Stop speaking when the page goes away.
	 *
	 * The speech engine belongs to the browser, not the document, so
	 * queued utterances happily carry on after the tab is closed — with
	 * no window left to stop them from. Cancel explicitly on unload.
	 *
	 * Deliberately not hooked to visibilitychange: someone switching
	 * tabs still wants to hear what happened.
	 */
	registerLifecycleHandlers() {
		if ( this._lifecycleBound || ! globalThis.addEventListener ) {
			return;
		}

		this._lifecycleBound = true;
		const cancel = () => this.stop();

		// pagehide covers tab close and navigation, including cases
		// where unload never fires; beforeunload catches the rest.
		globalThis.addEventListener( 'pagehide', cancel );
		globalThis.addEventListener( 'beforeunload', cancel );
	}

	/**
	 * Keep tracking the voice list after startup.
	 *
	 * Browsers populate voices asynchronously and some — Chrome most
	 * noticeably — fire 'voiceschanged' well after the page has loaded,
	 * or again when the OS voice set changes. A one-shot read at
	 * startup can therefore miss voices the user actually has, so stay
	 * subscribed and refresh whenever the browser tells us to.
	 *
	 * @param {(voices: SpeechSynthesisVoice[]) => void} callback
	 */
	onVoicesChanged( callback ) {
		if ( ! this.synth?.addEventListener ) {
			return;
		}

		this.synth.addEventListener( 'voiceschanged', () => {
			this.voices = this.synth.getVoices() ?? [];
			callback( this.voices );
		} );
	}

	/**
	 * Warn once if speech synthesis isn't present — notably possible in
	 * some desktop/Electron builds — instead of failing silently, which
	 * for an accessibility tool is the worst outcome.
	 */
	warnIfUnavailable() {
		if ( this.available || this._warned ) {
			return;
		}

		this._warned = true;
		ui.notifications?.warn( game.i18n.localize( `${ MODULE_ID }.notifications.unavailable` ), {
			permanent: true,
		} );
	}

	resolveVoice() {
		const wanted = game.settings.get( MODULE_ID, SETTINGS.VOICE );

		if ( ! wanted ) {
			return null;
		}

		return this.voices.find( ( v ) => v.voiceURI === wanted || v.name === wanted ) ?? null;
	}

	/**
	 * Long strings can be dropped or truncated by some engines, so
	 * split on sentence boundaries and queue the pieces in order.
	 *
	 * @param {string} text
	 * @returns {string[]}
	 */
	chunk( text, maxLength = 200 ) {
		if ( text.length <= maxLength ) {
			return [ text ];
		}

		const sentences = text.match( /[^.!?]+[.!?]*\s*/g ) ?? [ text ];
		const chunks = [];
		let current = '';

		for ( const sentence of sentences ) {
			if ( ( current + sentence ).length > maxLength && current ) {
				chunks.push( current.trim() );
				current = '';
			}

			// A single sentence longer than the limit still has to go
			// somewhere; hand it over whole rather than cutting a word.
			current += sentence;
		}

		if ( current.trim() ) {
			chunks.push( current.trim() );
		}

		return chunks;
	}

	/**
	 * @param {string} text
	 * @param {object} [options]
	 * @param {boolean} [options.interrupt] Cancel anything already queued.
	 * @param {number}  [options.volume]    Override the configured volume,
	 *                                      used to set whispers apart.
	 */
	speak( text, { interrupt = false, volume = null } = {} ) {
		if ( ! this.available || ! text ) {
			return;
		}

		this.lastSpoken = text;
		this.lastVolume = volume;

		if ( interrupt ) {
			this.stop();

			// cancel() empties the queue asynchronously. Calling speak()
			// in the same tick races it: the new utterance is queued
			// behind the one being cancelled, so the old announcement
			// plays on and the "interrupt" appears to do nothing. Give
			// the engine a tick to actually flush.
			globalThis.setTimeout( () => this._enqueue( text, volume ), INTERRUPT_SETTLE_MS );
			return;
		}

		this._enqueue( text, volume );
	}

	/**
	 * Queue the chunks and start playback if idle.
	 *
	 * Chunks are spoken one at a time, each starting the next from its
	 * 'end' event, rather than handing the whole lot to the engine at
	 * once. That keeps every utterance short — which is what actually
	 * avoids the long-speech cutoff this used to paper over with a
	 * pause/resume timer — and it means stopping is simply a matter of
	 * emptying the queue.
	 *
	 * @param {string} text
	 * @param {number|null} volume
	 */
	_enqueue( text, volume ) {
		if ( ! this.available || ! text ) {
			return;
		}

		for ( const part of this.chunk( text ) ) {
			this._queue.push( { text: part, volume } );
		}

		if ( ! this._speaking ) {
			this._pump();
		}
	}

	/**
	 * Speak the next queued chunk, if any.
	 */
	_pump() {
		const next = this._queue.shift();

		if ( ! next ) {
			this._speaking = false;
			return;
		}

		this._speaking = true;

		const utterance = new globalThis.SpeechSynthesisUtterance( next.text );
		const voice = this.resolveVoice();

		if ( voice ) {
			utterance.voice = voice;
			// Some engines pick a default language unless told.
			utterance.lang = voice.lang;
		}

		utterance.rate = game.settings.get( MODULE_ID, SETTINGS.RATE );
		utterance.pitch = game.settings.get( MODULE_ID, SETTINGS.PITCH );
		utterance.volume = next.volume ?? game.settings.get( MODULE_ID, SETTINGS.VOLUME );

		// 'error' also fires when an utterance is cancelled, at which
		// point the queue is already empty and this simply settles.
		utterance.onend = () => this._pump();
		utterance.onerror = () => this._pump();

		this.synth.speak( utterance );
	}

	stop() {
		if ( ! this.available ) {
			return;
		}

		this._queue = [];
		this._speaking = false;

		// Cancelling while paused is unreliable on some engines.
		if ( this.synth.paused ) {
			this.synth.resume();
		}

		this.synth.cancel();
	}

	repeatLast() {
		if ( ! this.lastSpoken ) {
			ui.notifications?.info( game.i18n.localize( `${ MODULE_ID }.notifications.nothingToRepeat` ) );
			return;
		}

		// Repeat at the volume it was originally said at, so a repeated
		// whisper stays a whisper.
		this.speak( this.lastSpoken, { interrupt: true, volume: this.lastVolume } );
	}
}

export const speech = new SpeechEngine();
