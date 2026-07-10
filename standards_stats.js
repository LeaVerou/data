/**
 * Aggregate stats on how long spec proposals took to ship across browsers.
 *
 * Exports one entry per interval, keyed by the ship it ends at:
 * - first:  specced milestone → first stable browser release
 * - second: first → second browser
 * - third:  second → third (last) browser
 *
 * Only proposals that actually reached each stage are counted (e.g. a proposal
 * with no `specced` milestone still contributes to the ship-to-ship intervals).
 * Flagged and beta releases don’t count as ships.
 *
 * @typedef {Number} Duration Days; `toString()` returns a human-friendly form like "1y 9m"
 * @typedef {{id: string, days: Duration}} Extreme A specific proposal and its duration
 * @typedef {{count: number, mean: Duration, median: Duration, min: Extreme, max: Extreme}} IntervalStats
 *
 * Usage e.g. `{{ standards_stats.first.median }}` → "7m 1d", or `standards_stats.second.max.id`.
 * An interval is `null` if no proposal reached it.
 */

import proposals from "./standards.cjs";

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365.2425;
const MONTH = YEAR / 12;

const durationFormat = new Intl.DurationFormat("en", {style: "narrow"});

/** Day count that stringifies as a human-friendly approximate duration */
class Duration extends Number {
	toString () {
		if (+this === 0) {
			// Intl.DurationFormat renders all-zero durations as ""
			return "0d";
		}

		let abs = Math.abs(this);
		let sign = this < 0 ? -1 : 1;

		let years = Math.floor(abs / YEAR);
		let months = Math.floor((abs % YEAR) / MONTH);
		let days = Math.round(abs % MONTH);

		// Keep the two most significant units
		let parts = years > 0 ? {years, months} : months > 0 ? {months, days} : {days};
		for (let unit in parts) {
			parts[unit] *= sign;
		}

		return durationFormat.format(parts);
	}
}

function days (from, to) {
	return new Duration(Math.round((to - from) / DAY));
}

// First stable (unflagged, non-beta) ship per browser, sorted chronologically.
// standards.cjs has already resolved browser release dates onto milestones.
function getShips (proposal) {
	let byBrowser = {};

	for (let milestone of proposal.milestones) {
		if (milestone.type !== "shipped" || milestone.flag || !milestone.date || /beta/i.test(milestone.version)) {
			continue;
		}

		let date = new Date(milestone.date);
		if (!byBrowser[milestone.browser] || date < byBrowser[milestone.browser].date) {
			byBrowser[milestone.browser] = {browser: milestone.browser, version: milestone.version, date};
		}
	}

	return Object.values(byBrowser).sort((a, b) => a.date - b.date);
}

function getStats (entries) {
	if (entries.length === 0) {
		return null;
	}

	let sorted = entries.toSorted((a, b) => a.days - b.days);
	let mid = sorted.length >> 1;
	let median = sorted.length % 2 ? sorted[mid].days : (sorted[mid - 1].days + sorted[mid].days) / 2;

	return {
		count: sorted.length,
		mean: new Duration(Math.round(sorted.reduce((sum, e) => sum + e.days, 0) / sorted.length)),
		median: new Duration(Math.round(median)),
		min: sorted[0],
		max: sorted.at(-1),
	};
}

const intervals = ["first", "second", "third"];
let byInterval = Object.fromEntries(intervals.map(key => [key, []]));

for (let proposal of proposals.flatMap(p => p.parts ?? [p])) {
	let ships = getShips(proposal);

	if (ships.length === 0) {
		continue;
	}

	let speccedDates = proposal.milestones
		.filter(m => m.type === "specced" && m.date)
		.map(m => new Date(m.date));
	let spec = speccedDates.length > 0 ? new Date(Math.min(...speccedDates)) : null;

	// Consecutive gaps: spec → 1st browser → 2nd → 3rd
	let boundaries = [spec, ...ships.map(s => s.date)];

	for (let [i, key] of intervals.entries()) {
		if (boundaries[i] && boundaries[i + 1]) {
			byInterval[key].push({id: proposal.id, days: days(boundaries[i], boundaries[i + 1])});
		}
	}
}

export default Object.fromEntries(intervals.map(key => [key, getStats(byInterval[key])]));
