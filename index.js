/**
 * External dependencies
 */
var request = require( 'superagent' ),
	fs = require( 'mz/fs' ),
	parseUrl = require( 'url' ).parse,
	_ = require( 'lodash' ),
	ghpages = require( 'gh-pages' );

/**
 * Constants
 */
var API_BASE = 'https://central.wordcamp.org/wp-json',
	POSTS_PER_PAGE = 100,
	OUTPUT_FILE = './camps.json';

function fetchTotalCamps() {
	return request
		.head( API_BASE + '/posts' )
		.query( {
			type: 'wordcamp',
			filter: {
				posts_per_page: 1
			}
		} )
		.then( function( response ) {
			return response.headers[ 'x-wp-total' ];
		} );
}

function fetchPageAndFilterScheduled( page ) {
	return request
		.get( API_BASE + '/posts' )
		.query( {
			type: 'wordcamp',
			page: page,
			filter: {
				posts_per_page: POSTS_PER_PAGE
			}
		} )
		.then( function( response ) {
			return response.body.filter( function( camp ) {
				return 'wcpt-scheduled' === camp.status;
			} );
		} );
}

function fetchScheduledCamps() {
	return fetchTotalCamps().then( function( total ) {
		var pages = Math.ceil( total / POSTS_PER_PAGE );
		return Promise.all( _.times( pages, function( index ) {
			var page = index + 1;
			return fetchPageAndFilterScheduled( page );
		} ) ).then( function( filteredPages ) {
			return _.flatten( filteredPages );
		} );
	} );
}

function getPostMetaValue( post, key ) {
	return _.get( _.find( post.post_meta, {
		key: key
	} ), 'value' );
}

function getCampDate( camp ) {
	var date = getPostMetaValue( camp, 'Start Date (YYYY-mm-dd)' );
	return new Date( parseInt( date * 1000, 10 ) );
}

function getCampSubdomain( camp ) {
	var url = getPostMetaValue( camp, 'URL' ),
		parsed, match;

	if ( ! url ) {
		return;
	}

	parsed = parseUrl( url );
	match = parsed.host.match( /^\d{4}\.([^\.]+)/ );
	if ( ! match ) {
		return;
	}

	return match[ 1 ];
}

function getCampDescription( camp ) {
	return camp.content
		.replace( /<p[^>]*>/g, '' )
		.replace( /<\/p>/g, '\n\n' )
		.replace( /(\n){3,}/g, '\n\n' )
		.replace( /\s+$/g, '' );
}

function transformCamp( camp ) {
	var date = getCampDate( camp );

	return {
		title: camp.title,
		slug: camp.slug,
		date: date.valueOf(),
		year: date.getFullYear(),
		subdomain: getCampSubdomain( camp ),
		description: getCampDescription( camp )
	};
}

function writeCamps( camps ) {
	return fs.writeFile( OUTPUT_FILE, JSON.stringify( camps ) );
}

function fetchAndWriteCamps() {
	return fetchScheduledCamps().then( function( scheduledCamps ) {
		var transformedCamps = scheduledCamps.map( transformCamp ),
			orderedCamps = _.orderBy( transformedCamps, 'date', 'desc' );

		return writeCamps( orderedCamps );
	} );
}

fetchAndWriteCamps().then( function() {
	var message = ( new Date() ).toISOString().match( /^(\d{4}-\d{2}-\d{2})/ )[ 1 ];
	ghpages.publish( __dirname, {
		src: 'camps.json',
		message: message
	} );
} ).catch( function( error ) {
	console.error( error );
} );
