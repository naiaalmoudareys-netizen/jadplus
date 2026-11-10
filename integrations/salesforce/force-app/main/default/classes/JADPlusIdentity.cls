/**
 * JAD+ owner identity (JAD+ ADR 0005, control C-AUTH-3). Read-only: no DML, no emails, no callouts.
 * Called only by the finance worker (integration user) on behalf of the JAD+ API, never by a browser or app.
 *
 *   GET /services/apexrest/jadplus/identity?email=...      (an email JAD+ is about to verify with a code)
 *   GET /services/apexrest/jadplus/identity?phone=+971...  (a mobile number, international form)
 *
 * Answers for ONE person:
 *   { found, shared, person: { contactId, name, email, mobile } | null,
 *     units: [ { unitId, dealId, unitName, project, role: 'Buyer' | 'Joint buyer' } ] }
 * A person is matched on their person account's email fields, or on Account.Mobile_Match_Key__c (last 9 digits).
 * Units are those of Sold or Booked deals where the person is the buyer or a contact role (joint buyer),
 * the same rule as JADPortalApi. If the email or number belongs to more than one different person, nobody is
 * returned (shared = true): one person must never see another's units.
 * Created 10-Nov-2026 for JAD+ (repo jadplus, integrations/salesforce).
 */
@RestResource(urlMapping='/jadplus/identity')
global without sharing class JADPlusIdentity {

    @TestVisible static final Set<String> OWNER_STAGES = new Set<String>{ 'Sold', 'Booked' };
    static final Pattern EMAIL_RE = Pattern.compile('^[^@\\s]{1,64}@[^@\\s]{1,185}\\.[^@\\s]{2,20}$');
    static final Pattern PHONE_RE = Pattern.compile('^\\+[1-9][0-9]{7,14}$');

    @HttpGet
    global static void doGet() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');
        String email = req.params.get('email');
        String phone = req.params.get('phone');
        if ((email == null) == (phone == null)) { fail(res, 'give exactly one of email or phone'); return; }
        List<Account> accts;
        if (email != null) {
            email = email.trim().toLowerCase();
            if (!EMAIL_RE.matcher(email).matches()) { fail(res, 'bad email'); return; }
            accts = byEmail(email);
        } else {
            phone = phone.trim();
            if (!PHONE_RE.matcher(phone).matches()) { fail(res, 'bad phone'); return; }
            accts = byPhoneKey(phone.right(9));
        }
        res.responseBody = Blob.valueOf(JSON.serialize(answer(accts)));
    }

    static void fail(RestResponse res, String message) {
        res.statusCode = 400;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, String>{ 'error' => message }));
    }

    static List<Account> byEmail(String email) {
        return [SELECT Id, Name, FirstName, PersonContactId, PersonEmail, PersonMobilePhone, Phone
                FROM Account
                WHERE IsPersonAccount = true
                  AND (PersonEmail = :email OR Email__c = :email OR Primary_Email__c = :email OR Alternate_Email__c = :email)
                WITH SYSTEM_MODE LIMIT 20];
    }

    static List<Account> byPhoneKey(String key) {
        return [SELECT Id, Name, FirstName, PersonContactId, PersonEmail, PersonMobilePhone, Phone
                FROM Account
                WHERE IsPersonAccount = true AND Mobile_Match_Key__c = :key
                WITH SYSTEM_MODE LIMIT 20];
    }

    /** The same person entered twice (same name) is one person; different names are different people. */
    @TestVisible static String personKey(Account a) {
        return (a.Name == null ? '' : a.Name).toLowerCase()
            .replaceAll('^(mr|mrs|ms|miss|dr)\\.?\\s+', '').replaceAll('[^a-z\\u0600-\\u06FF]', '');
    }

    @TestVisible static Map<String, Object> answer(List<Account> accts) {
        Set<String> people = new Set<String>();
        for (Account a : accts) people.add(personKey(a));
        if (people.size() > 1) return result(false, true, null, new List<Object>());

        List<Object> units = units(accts);
        if (units.isEmpty()) return result(false, false, null, units);
        Account main = accts[0];
        String email = main.PersonEmail == null ? null : main.PersonEmail.trim().toLowerCase();
        if (email != null && !EMAIL_RE.matcher(email).matches()) email = null;
        String mobile = String.isNotBlank(main.PersonMobilePhone) ? main.PersonMobilePhone : main.Phone;
        Map<String, Object> person = new Map<String, Object>{
            'contactId' => main.PersonContactId,
            'name' => main.Name.left(200),
            'email' => email,
            'mobile' => mobile == null ? null : mobile.left(40)
        };
        return result(true, false, person, units);
    }

    static Map<String, Object> result(Boolean found, Boolean shared, Map<String, Object> person, List<Object> units) {
        return new Map<String, Object>{ 'found' => found, 'shared' => shared, 'person' => person, 'units' => units };
    }

    /** Sold or Booked deals of this person, as buyer or as a contact role on the deal (joint buyer). */
    @TestVisible static List<Object> units(List<Account> accts) {
        List<Object> out = new List<Object>();
        if (accts.isEmpty()) return out;
        Set<Id> acctIds = new Set<Id>();
        Set<Id> contactIds = new Set<Id>();
        for (Account a : accts) { acctIds.add(a.Id); if (a.PersonContactId != null) contactIds.add(a.PersonContactId); }
        Map<Id, String> roles = new Map<Id, String>();
        for (Opportunity o : [SELECT Id FROM Opportunity WHERE AccountId IN :acctIds AND StageName IN :OWNER_STAGES WITH SYSTEM_MODE]) {
            roles.put(o.Id, 'Buyer');
        }
        for (OpportunityContactRole r : [SELECT OpportunityId FROM OpportunityContactRole
                                         WHERE ContactId IN :contactIds AND Opportunity.StageName IN :OWNER_STAGES WITH SYSTEM_MODE]) {
            if (!roles.containsKey(r.OpportunityId)) roles.put(r.OpportunityId, 'Joint buyer');
        }
        Set<Id> seenUnits = new Set<Id>();
        for (Opportunity o : [SELECT Id, Unit__c, Unit__r.Name, Unit__r.Project__r.Name FROM Opportunity
                              WHERE Id IN :roles.keySet() AND Unit__c != null WITH SYSTEM_MODE ORDER BY Unit__r.Name LIMIT 200]) {
            if (seenUnits.contains(o.Unit__c)) continue;
            seenUnits.add(o.Unit__c);
            String project = o.Unit__r.Project__r == null ? null : o.Unit__r.Project__r.Name;
            out.add(new Map<String, Object>{
                'unitId' => o.Unit__c,
                'dealId' => o.Id,
                'unitName' => o.Unit__r.Name.left(80),
                'project' => project == null ? null : project.left(120),
                'role' => roles.get(o.Id)
            });
        }
        return out;
    }
}
