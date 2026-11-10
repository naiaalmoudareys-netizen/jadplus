/** Tests for JADPlusIdentity. Fictional people only (example.invalid, +971 50 000 000x). */
@isTest
private class JADPlusIdentityTest {

    static final String OWNER_EMAIL = 'layla.haddad@example.invalid';
    static final String JOINT_EMAIL = 'joint.test@example.invalid';
    static final String SHARED_EMAIL = 'shared.test@example.invalid';
    static final String GONE_EMAIL = 'cancelled.test@example.invalid';

    @TestSetup
    static void setupData() {
        Project__c proj = new Project__c(Name = 'JAD 288', Project_Completion_Date__c = 'Q2 2028');
        insert proj;
        Building__c build = new Building__c(Name = 'Building A', Project__c = proj.Id);
        insert build;
        Floor__c floor = new Floor__c(Name = 'Floor 11', Building__c = build.Id, Project__c = proj.Id);
        insert floor;
        Unit__c mine = new Unit__c(Project__c = proj.Id, Floors__c = floor.Id, SellingPrice__c = 1000000, TotalArea__c = 1000, Status__c = 'Available');
        Unit__c cancelled = new Unit__c(Project__c = proj.Id, Floors__c = floor.Id, SellingPrice__c = 900000, TotalArea__c = 900, Status__c = 'Available');
        insert new List<Unit__c>{ mine, cancelled };

        Id personRt = [SELECT Id FROM RecordType WHERE SObjectType = 'Account' AND IsPersonType = true AND IsActive = true LIMIT 1].Id;
        Account owner = new Account(RecordTypeId = personRt, FirstName = 'Layla', LastName = 'Haddad', PersonEmail = OWNER_EMAIL,
            PersonMobilePhone = '+971 50 000 0001');
        Account joint = new Account(RecordTypeId = personRt, FirstName = 'Jamal', LastName = 'Joint', PersonEmail = JOINT_EMAIL);
        Account sharedA = new Account(RecordTypeId = personRt, FirstName = 'Sara', LastName = 'One', PersonEmail = SHARED_EMAIL,
            PersonMobilePhone = '050 000 0002');
        Account sharedB = new Account(RecordTypeId = personRt, FirstName = 'Omar', LastName = 'Two', PersonEmail = SHARED_EMAIL,
            PersonMobilePhone = '+971500000002');
        Account gone = new Account(RecordTypeId = personRt, FirstName = 'Nadia', LastName = 'Cancelled', PersonEmail = GONE_EMAIL);
        insert new List<Account>{ owner, joint, sharedA, sharedB, gone };

        Opportunity sold = new Opportunity(Name = 'Deal sold', AccountId = owner.Id, Unit__c = mine.Id, StageName = 'Sold', CloseDate = Date.today());
        Opportunity lost = new Opportunity(Name = 'Deal lost', AccountId = gone.Id, Unit__c = cancelled.Id, StageName = 'Sold', CloseDate = Date.today());
        Opportunity sharedDeal = new Opportunity(Name = 'Deal shared', AccountId = sharedA.Id, Unit__c = cancelled.Id, StageName = 'Sold', CloseDate = Date.today());
        insert new List<Opportunity>{ sold, lost, sharedDeal };
        sold.StageName = 'Sold'; lost.StageName = 'Closed Lost'; sharedDeal.StageName = 'Booked';  // trigger resets new deals
        update new List<Opportunity>{ sold, lost, sharedDeal };
        Id jointContact = [SELECT PersonContactId FROM Account WHERE Id = :joint.Id].PersonContactId;
        insert new OpportunityContactRole(OpportunityId = sold.Id, ContactId = jointContact, Role = 'Joint Buyer2');
    }

    static Map<String, Object> call(String param, String value) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/jadplus/identity';
        req.httpMethod = 'GET';
        if (param != null) req.params.put(param, value);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        JADPlusIdentity.doGet();
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
        body.put('_status', RestContext.response.statusCode);
        return body;
    }

    @isTest static void buyerByEmailGetsTheirUnit() {
        Map<String, Object> r = call('email', '  Layla.Haddad@Example.invalid ');
        System.assertEquals(true, r.get('found'));
        System.assertEquals(false, r.get('shared'));
        Map<String, Object> person = (Map<String, Object>) r.get('person');
        System.assertEquals('Layla Haddad', person.get('name'));
        System.assertEquals(OWNER_EMAIL, person.get('email'));
        List<Object> units = (List<Object>) r.get('units');
        System.assertEquals(1, units.size());
        Map<String, Object> u = (Map<String, Object>) units[0];
        System.assertEquals('Buyer', u.get('role'));
        System.assertEquals('JAD 288', u.get('project'));
    }

    @isTest static void buyerByMobileWrittenDifferently() {
        Map<String, Object> r = call('phone', '+971500000001');
        System.assertEquals(true, r.get('found'));
        System.assertEquals('Layla Haddad', ((Map<String, Object>) r.get('person')).get('name'));
    }

    @isTest static void jointBuyerSeesTheDealAsJointBuyer() {
        Map<String, Object> r = call('email', JOINT_EMAIL);
        System.assertEquals(true, r.get('found'));
        Map<String, Object> u = (Map<String, Object>) ((List<Object>) r.get('units'))[0];
        System.assertEquals('Joint buyer', u.get('role'));
    }

    @isTest static void sharedEmailOrNumberReturnsNobody() {
        for (Map<String, Object> r : new List<Map<String, Object>>{ call('email', SHARED_EMAIL), call('phone', '+971500000002') }) {
            System.assertEquals(false, r.get('found'));
            System.assertEquals(true, r.get('shared'));
            System.assertEquals(null, r.get('person'));
            System.assertEquals(0, ((List<Object>) r.get('units')).size());
        }
    }

    @isTest static void cancelledDealOrUnknownPersonIsNotAnOwner() {
        for (Map<String, Object> r : new List<Map<String, Object>>{ call('email', GONE_EMAIL), call('email', 'nobody@example.invalid') }) {
            System.assertEquals(false, r.get('found'));
            System.assertEquals(false, r.get('shared'));
            System.assertEquals(null, r.get('person'));
        }
    }

    @isTest static void badRequestsAreRefused() {
        System.assertEquals(400, call(null, null).get('_status'));
        System.assertEquals(400, call('email', 'not-an-email').get('_status'));
        System.assertEquals(400, call('phone', '0500000001').get('_status'));
    }
}
