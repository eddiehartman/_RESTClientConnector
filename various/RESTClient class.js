// 20250116 1116 Created
// ...
// 20250523 1159 Changed the handling of the CSRFToken read as "http.CSRFToken"
// 20250629 2222 Added garbage collection and chunk handling, both in makeRequest()
// 20250702 1424 Franz fixed my misunderstanding of the chunk encoding - the HTTP Connector handles all that
// 20250819 1029 Changed handling of cookies after seeing how Franz does it - using just Attributes and values
// 20250823 2118 selectEntries and getNextEntry working
// 20250825 1412 Removed old code from makeRequest that was messing up putEntry()
// 20250903 1353 Everything working pretty much now
// 20250926 2218 Fixed handling of returnType for makeRequest
// 20250930 1206 Added special handling of non-200 return codes getting tokens from ITIM & added more log output for requests and replies
// 20251007 1145 Corrected handling of 404 returns
// 20251027 2001 Everything working with full test AL for /people (again)
// 20251105 1401 Using cache-control:no-cache
// 20251122 1436 Made this.debug a numeric value. 1+ = exceptions include request & response, 5+ alert debug messages, 10+ logging of every request & response
// 20251216 1503 In .makeRequest() changed default accept type to "application/json"
// 20251229 1538 Tighted up makeRequest() handling of body and ctype - only for post and put
// 20250107 1445 Updated makeRequest to skip adding a request header prop if the value passed in is null
// 20250202 1413 Added Current User Path to the Connection tab and RESTCLIENT constructor
// 20250215 1730 Removed the meURL parameter, hardcoded now for ITIM
//
// This is the class that provides methods for making HTTP requests
//
// NOTES:
//			* It uses its own this.logmsg() for more control over logging

function RESTCLIENT(args) {
	this.baseUrl = (args.baseUrl || "").trim();
	this.contextRoot = args.contextRoot || "/itim/rest";
	this.apikey = args.apikey || "";
	this.username = args.username || ""; 
	this.password = args.password || "";
	this.authURL = args.authURL || args.authurl || args.authUrl || "/itim/j_security_check";
	this.meURL = /*args.meURL || args.meurl || args.meUrl || */ "/itim/rest/systemusers/me";
	this.debug = 1; // 1+ = request/response in error, 5+ = alerts, 10+ = each request/response logged to console
	this.cookies = system.newAttribute("http.Cookie");
	
	this.gettingToken = false;
	this.gotToken = false;

	// The HTTP Client Connector to use
	this.http = system.getConnector("ibmdi.HTTPClient");
	
	// Member variables
	this.requestEntry = system.newEntry();
	
	this.CSRFToken = null;
	this.sessionId = null; // REMOVE ME REMOVE ME REMOVE ME REMOVE ME !!!!!

	// Get the authentication token. Argument token tells makeRequest not to getToken, and skip parsing the body and instead return http.Set-Cookie
	this.getToken = function(where) {
		var retEntry;
		
		// Get rid of cookies
		this.cookies.clear();
		this.CSRFToken = null;
		
		// First the LTPAToken2
		retEntry = this.makeRequest({
				gettingToken: true, // Getting a token, so dont call getToken again
				verb: "POST",
				url: this.authURL, // @@TODO Should make this a parameter under Connections
				ctype: "application/x-www-form-urlencoded",
//				headers: {
//					Authorization: "Bearer " + this.apikey
//				},
				body: "j_username=" + this.username + "&j_password=" + this.password,
				expectedReturnType: "entry",
				where: "getToken()"
		});

		// Get CSRFToken
		retEntry = this.makeRequest({
				gettingToken: true, // Getting a token, so dont call getToken again
				expectedReturnType: "entry",
				verb: "POST",
				url: this.meURL, // @@TODO Should make this a parameter under Connections
				ctype: "application/json",
				expectedReturnType: "entry",
				where: "getToken()"
		})
	}
	
	// Get the currently set Cookies
	this.getCookies = function(where) {
		return this.cookies
	}
 
 	// Put together a URL from an array of parts
	this.assembleUrl = function(where, partsArray) {
		if (!(partsArray instanceof Array)) partsArray = [partsArray]; // Note - instanceof works only for identifying JS arrays
		var url = "";
		for (var i = 0; i < partsArray.length; i++) {
			var part = (partsArray[i] || "").trim();
			if (!part) continue; // skip empty string
			
			// Skip any bits that are uid specifiers in the url
			part = part.replace(/\/\{[^}]*\}/g, "");
			
			// Remove starting and/or ending slashes
			if (part.startsWith("/")) 
			{
				part = part.substring(1)
			}	
			else
			if (part.endsWith("/"))
			{
				part = part.substring(0, part.length-1)
			}
/*			
			if (where.equalsIgnoreCase("fetchSchema()")) { // skip rootContext if it's a schema query
				continue
			}	
*/			
			// Assemble the url
			url += ((i > 0) ? "/" : "") + part	
		}
		
		return url
	}	
	
	// REST Client http-call method. The first lines of code show you the parameters you can send in the 'param' JS object
	this.makeRequest = function(params) {
		// Get token if necessary
		if (!this.gotToken && !this.gettingToken) {
			//&& !(params.where || "").equalsIgnoreCase("fetchSchema()")) { // dont do this for fetchSchema()
			this.gettingToken = true;
			this.getToken(params.where || null);
			this.gettingToken = false;
			this.gotToken = true;
		} 
		
		//if (form && this.debug) this.alert("RESTCLIENT.makeRequest(" + toJson(params) + "}");
			
		// Here come the various local variables set from parameters passed OR default values
		var verb = params.verb || "GET";
		var url = params.url || this.throwException("makeRequest called with no URL");
		var p;

		// Set up the other local variables
		var body = params.body || null;
		var ctype = params.ctype // || "application/json"; No longer using a default
		var accept = params.accept // || "application/json"; No longer using a default
		var where = params.where || "";
		var headers = params.headers || {};
		var gettingToken = params.gettingToken || false;
		var username = params.username || "";
		var password = params.password || "";
		var contextRoot = (typeof(params.contextRoot) == "undefined") ? this.contextRoot : params.contextRoot;
		var findEntry = params.findEntry || false;
		
		var returnType = params.expectedReturnType || "JS object";
		
		// if url is an href, remove the stuff that this method adds to each call
		if (params.ishref) {
			// Remove the baseURL if present
			if (url.toLowerCase().startsWith(this.baseUrl.toLowerCase())) {
				url = url.substring(this.baseUrl.length)
			}
			// Remove the contextRoot if present
			if (url.toLowerCase().startsWith(this.contextRoot.toLowerCase())) {
				url = url.substring(this.contextRoot.length)
			}
			// Remove any query string
			if ((p = url.indexOf("?")) > 0) {
				url = url.substring(0, p-1)
			}
			
//			if (task instanceof com.ibm.di.server.AssemblyLine) task.logmsg(">> " + where + " Requesting entry by uid: " + url)
		}
		
		var alreadyImportedCert = false;
		
		// A little garbage collection. Why not? :)
		java.lang.Runtime.getRuntime().gc();
		
		// Empty out the requestEntry before setting it up for the call
		this.requestEntry.removeAllAttributes();
		
		// Prepare the url
		var origUrl = url;
		if (gettingToken || where.equalsIgnoreCase("fetchSchema()")) {
			url = this.assembleUrl(where, [this.baseUrl, url]) // Skip the context root for these calls
		} else {
			url = this.assembleUrl(where, [this.baseUrl, contextRoot, url])
		}
		
/* Is this even necessary anymore
		if (url == this.assembleUrl(where, [this.baseUrl, contextRoot])){
			url = this.assembleUrl(where, [this.baseUrl, contextRoot, "me"])
		}
*/
/*		
		// @@TODO Is there a better way to handle this?
		if ("POST".equals(verb) || "PUT".equals(verb)) {
			p = url.indexOf("{");
			if (p > 0) {
				url = url.substring(0, p-1)
			}
		}	
*/		
		// If a body is passed, this must be a POST (I think)
		if (typeof(body) != "undefined" && ("POST".equalsIgnoreCase(verb) || "PUT".equalsIgnoreCase(verb))) {
			//verb = "POST";
	
			if (typeof body != "string") {
				try {
					body = toJson(body);
				} catch (ex) {
					body = String(body)
				}		
			} 

			this.requestEntry["http.body"] = body
		}
		
		// Set up the global HTTP Connector
		this.http.setParam("method", verb.toUpperCase());
		this.http.setParam("url", url);
		this.http.setParam("username", username);
		this.http.setParam("password", password);
	
		// Now set up the request entry
		this.requestEntry["http.url"] = url;
		this.requestEntry["http.method"] = verb.toUpperCase();
		if (verb == "PUT" || verb == "POST") {
			if (ctype != null) {
				this.requestEntry["http.Content-Type"] = ctype
			}
			if (body != null && body.trim()) {
				this.requestEntry["http.body"] = body
			}
		}
		if (accept != null) {
			this.requestEntry["http.Accept"] = accept
		}
		
		// if credentials set then send them
		if (username != ""){
			this.requestEntry["http.remote_user"] = username;
			this.requestEntry["http.remote_password"] = password;
		}		
		 				
		for (var hdr in headers) {
			this.requestEntry["http." + hdr] = headers[hdr]
		}
		
		// Reinitialize the HTTP Client connector so the updated parameters are applied
		this.http.terminate();
		this.http.initialize(null);
	
		alreadyImportedCert = false; 
		var reply = null;
		// Make the call
		do {
			var retry = false;
			try {	
				//this.alert("\nMaking call:" + this.reduceEntry(this.requestEntry) + "\n");
				
				// Set cookies
 				this.requestEntry.setAttribute("http.Cookie",this.getCookies(where))
				
				
				if (this.CSRFToken) {
					this.requestEntry["http.CSRFToken"] = this.CSRFToken
				}
//				if (this.ltpaToken2) {
//					this.requestEntry["http.ltpaToken2"] = this.ltpaToken2
//				}

				// Turn off caching
				this.requestEntry["http.Cache-Control"] = "no-cache";
					
				if (this.debug >= 10) {
					this.logDetails({
								msg : "Request to itim", 
								entry : this.entryDetails(this.requestEntry, true), 
								url : url, 
								verb : verb, 
								ctype : ctype, 
								where : where,
								sent: true});
					__respCount = (typeof(__respCount) == "undefined") ? 1 : __respCount + 1;
					//if (typeof(task) != "undefined") task.logmsg("=====> Request #" + __respCount + " -> " + this.requestEntry)
				}
	
		
				// *****************************************************************************************
				// ****************         Make the actual request         ********************************
				// *****************************************************************************************

				var retEntry = this.http.queryReply(this.requestEntry);

				retEntry["http.url"] = url; // Another fix from @@Chat
				
				if (this.debug >= 10) {
					this.logDetails({msg : "Response from itim", 
								entry : this.entryDetails(retEntry),
								where: where,
								sent: false,
							    entry : retEntry});
					//if (typeof(task) != "undefined") task.logmsg("-----> Reply #" + __respCount + " -> " + retEntry.toString().substring(0,1024))
				}

				if (retEntry["http.Set-Cookie"]) {
					for (var cookie in retEntry["http.Set-Cookie"]) {
						var parts = system.splitString(cookie, "=");
						for (var val in this.cookies){
							if (val.startsWith(parts[0])) { //Is this the same cookie? Then delete the old one
								this.cookies.removeValue(val)
							}	
						}
						this.cookies.addValue(cookie)
					}	
				}
				
				// Grab the CSRFToken if found
				if (retEntry.getString("http.CSRFToken")) {
					this.CSRFToken = retEntry.getString("http.CSRFToken");
				}	
				
				var retCode = retEntry.getString("http.responseCode");
				
				// @@TODO Do we need to handle redirection (302)?
				if ("findEntry()".equalsIgnoreCase(where) && retCode == "404") { // Triggers OnNoMatch Hook workflow for the Connector
					return null
				} else
				if (retCode == "401") { // Unauthorized - time to renew the token // @@TODO? Or is it done - will have to look into this
					this.throwException("Unauthorized")
				} else
				if (retCode.startsWith("4") && (retCode != "404")) { // @@ TODO This is an ITIM thing I believe
					// Check if this is a Not Found error
					try {
						var response = fromJson(retEntry.getString("http.body") || "{}");
						var msg = response.text;
						if (msg.toLowerCase().indexOf("ldap: error code 32")) {
							return null; // Lookup failed
						}	
					} catch (ex) {
						// not a JSON return... strange
					}		
				}
				
				// If not retrying then figure out what to return
				if (!retry) {
					// Decide what to return, based on the returnType argument passed in and continue processing this request
					reply = this.parseReply(this.requestEntry, retEntry, returnType, gettingToken, where);
				}	
				
			} catch (ex) {
				//if (form && this.debug) this.alert("Exception: " + ex);
				
//				if (task instanceof com.ibm.di.server.AssemblyLine) task.logmsg("\n------------------ From ITIM:\n" + reply);
				
				// If the token has expired, get a new one
				if (ex.toString().indexOf("Unauthorized") >= 0) {
					this.getToken();
					retry = true
				} else
				// Else if we first must import the client cert, then do so. The Server must be restarted after.
				if (ex instanceof javax.net.ssl.SSLHandshakeException) {
					if ((ex.toString().indexOf("Certificate chaining error") >= 0) && alreadyImportedCert) {
						this.throwException("You must restart the SDI server in order for the imported certificate to be trusted.")
					}
					this.getCertificate();
					alreadyImportedCert = true;
					retry = true;
				} else
				// If a redirect - follow the redirect
				if (typeof retEntry != "undefined" && retEntry && retEntry.getString("http.responseCode").startsWith("3") && !gettingToken) { // @@Chat
					this.requestEntry["http.url"] = retEntry.getString("http.Location");
 					retry = true;
				} else {
					throw ex;
				}	
			}
		} while (retry);
				
		//if (form && this.debug) this.alert("reply: " + toJson(reply));
		
		return reply;
	}
	
	// Remove some attributes from an Entry
	this.reduceEntry = function(entryArg) {
		var entry = system.newEntry();
		entry = entryArg.clone();
		entry.removeAttribute("http.base");
		entry.removeAttribute("http.body.response");
		entry.removeAttribute("http.ipaddress");
		entry.removeAttribute("http.bodyAsBytes");
		return entry
	}	
	
	// Handle terminate to close the connector
	this.terminate = function() {
		this.http.terminate();
		this.CSRFToken = null
	}
	
	// Handle alerting - @@ DISABLED for now
	this.alert = function(msg, force) {
		if ((this.debug >= 5) && !force) return; // changed from 'continue' thanks to @@Chat
//		if (task instanceof com.ibm.di.server.AssemblyLine) task.logmsg(msg);
		main.logmsg(msg);
		java.lang.System.out.println(msg)
	}	
		
	
	// Get the client certificate from the server and import it to the TDI keystore
	this.getCertificate = function() {
		this.logmsg("! Getting client cert");
		var msg = com.ibm.di.security.GetSSLCertificate.installCertificateFrom(this.baseUrl, 443);
		this.logmsg("! Result: " + msg)
	}
	
	// Log specifics arguments passed to makeRequest()
	this.logDetails = function(params, sent) {
		sent = sent || false;
		var msg = params.msg;
		var entry = params.entry; 
		var url = params.url;
		var verb = params.verb;
		var ctype = params.ctype; 
		var where = params.where;

		if (msg == null) {
			msg = "*unknown entry*";
		}
	
		var s = new java.lang.StringBuffer();
		
		if (where != null) {
			s.append("\n<<" + where + ">> " + msg);
		} else {
			s.append("\n---------> " + msg);
		}
		
		
		if (verb != null) { s.append("   " + verb.toUpperCase()); } 
		if (ctype != null) { s.append("   " + ctype); } 
		if (url != null) { s.append("   " + url); } 
		s.append("\n");
	
		if (entry != null) {
			if (entry instanceof com.ibm.di.entry.Entry) {	
				s.append(this.entryDetails(entry, sent))	
			} else {
				s.append(entry.toString());
			}
		}	
	
		this.logmsg(s.toString());
//		main.logmsg(s.toString());
		java.lang.System.out.println(s.toString())
		if (typeof(alert) == "function") alert(s.toString())
	}

	this.throwException = function(msg) {
		throw new java.lang.Exception(msg);
	}

	// Checks the validity of the reply and sets up for Iteration
	this.parseReply = function(requestEntry, replyEntry, returnType, gettingToken, where) {
		if (replyEntry === null) { return } 
		
		var resCode = replyEntry.getString("http.responseCode");
		
		if (resCode == "302" && gettingToken) {
			// @@TODO Treat as OK - for ITIM
		} else
		if (resCode == "404") {
			return null
		} else
		if (!resCode.startsWith("2") 
			&& !((resCode == "400") && gettingToken)) { // @@ Necessary for ITIM
			var errMsg = where + " - Error response from ITIM. Response code: " 
								+ resCode
								+ "\n    Message: " + replyEntry.getString("http.responseMsg") 
								+ "\n      Error: " + replyEntry.getString("http.bodyAsString");
								
			if (this.debug) {
				errMsg += ("\n---> Request: " + requestEntry
							+ "\n===> Reply: " + replyEntry);
			}
			
			this.throwException(errMsg)
		}
		
		if (!"JS object".equalsIgnoreCase(returnType)) {
			return replyEntry
		}
		
		// Now parse the body
		var body = replyEntry.getString("http.bodyAsString");
	
		try {
			var reply = fromJson(body || '{"result": "Add request being processed"}');
		} catch (ex) {
			this.throwException("Error parsing return payload from itim: " + ex.toString()
							+ "\n*** dump of reply ***\n" 
							+ replyEntry)
		}
			
		return reply;
	}
	
	// Left justified text
	this.LJ = function(txt, len) {
		txt = txt || "";
		len = len || txt.length;
		return (txt + "                                                       ").substring(0, len)
	}
	
	// Returns a string with legible listing of important attributes and their values
	this.entryDetails = function(entry, sent) {
		if (!entry) return "";
		
		var entry = this.reduceEntry(entry);
		
		if (typeof(sent) == "undefined") sent = false;
		
		var txt = sent ? "--->>>> Request:\n" : "<<<<--- Response:\n";
	
		
		for (var att in entry) {
			var name = att.getName();
			var val = att.toString().substring(0,1024);
			txt += "  " + val + "\n"
		}
		
		return txt
	}

	// Own logmsg() to aid in debugging to output to the log and console
	this.logmsg = function(lvl, msg) {
		if (!lvl) { // undefined, and allows just a call to this.logmsg() to log a carriage return
			lvl = "INFO";
			msg = ""
		} else
		if (!msg) {
			msg = lvl;
			lvl = "INFO"
		}
		
		if ("DEBUG".equalsIgnoreCase(lvl)) {
			// Write to console out also
			java.lang.System.out.println("|" + this.LJ(lvl,5) + "| " + msg);
		}
		
		// This to allow it to be used by Connector Form Event script
//		if (task instanceof com.ibm.di.server.AssemblyLine) task.logmsg(lvl, msg);
		main.logmsg(lvl, msg);
		if (typeof(task) != "undefined") task.logmsg(lvl, msg);
		java.lang.System.out.println(((lvl == "INFO") ? "" : lvl) + msg)
	}	
}