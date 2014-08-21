var should = require("should");
var _ = require("lodash");
var chance = require("chance").Chance(9); // use exactly same seed for deterministic tests
var path = require("path");
var os = require("os");
var utils = require(__dirname + "/utils");
var letter = require(__dirname + "/../simaya/models/letter.js")(utils.app);
var user = utils.app.db("user"); 
var orgDb = utils.app.db("organization"); 
var fs = require("fs");
var async = require("async");

function bulkInsert(counter, callback) {
  user.insert({
    username: "user" + counter, 
    profile: {
      organization: "org" + counter
    }
  }, function(e,v) {
    if (counter > 10) {
      callback();
      return;
    }
    bulkInsert(counter + 1, callback);
  });
}

var clearUser = function(cb) {
  user.remove({}, {j:false}, cb);
}

var insertUser = function(u, cb) {
  user.insert({
    username: u.username,
    profile: {
      organization: u.org,
      roleList: u.roleList
    }
  }, cb);
}

var insertOrg = function(org, cb) {
  orgDb.insert({
    name: org.name,
    path: org.path,
    head: org.head
  }, cb);
}

var createFile = function() {
  var filename = chance.string({length: 20});
  var fullFilename = path.join(os.tmpdir(), filename);
  var data = '';
  for (var i = 0; i < 100; i ++) {
    data += chance.paragraph();
  }
  fs.writeFileSync(fullFilename, data);

  return {
    name: filename,
    path: fullFilename,
    type: "text/plain",
    size: fs.statSync(fullFilename).size
  };
}

var saveAttachment = function(data, cb) {
  var file = createFile();
  var selector = {_id: data._id};
  letter.saveAttachmentFile(file, function(err, r0) {
    should(err).not.be.ok;
    
    var selector = {_id: data._id};
    file.path = r0.fileId;

    letter.addFileAttachment(selector, file, function(err) { 
      should(err).not.be.ok;
      letter.editLetter(selector, data, function(err, r1) {
        should(err).not.be.ok;
        var filePath = path.join(os.tmpdir(), chance.string({length:20}));
        var stream = fs.createWriteStream(filePath);
        // mock http response stream
        stream.contentType = function() {};
        stream.attachment = function() {};

        var done = function(err) {
          should(err).not.be.ok;
        };

        stream.on("finish", function(){
          file.size.should.equal(fs.statSync(filePath).size);
          fs.unlinkSync(filePath);
          cb (r1);
        });

        letter.downloadAttachment(file.path, stream, done);
      });
    });
  });
}


describe("Letter", function() {

  before(function() {
    utils.db.open(function() {
      bulkInsert(1, function(){});
    });
  });

  describe("Letter[Draft]", function() {
    it ("should fail when creating draft with empty data", function(done) {
      letter.createLetter({}, function(err, data) {
        should(err).be.ok;
        done();
      });
    });

    it ("should fail when missing originator", function(done) {
      letter.createLetter({sender:"abc", creationDate: new Date}, function(err, data) {
        should(err).be.ok;
        data.should.have.property("fields");
        data.fields.should.containEql("originator");
        done();
      });
    });

    it ("should fail when missing sender", function(done) {
      letter.createLetter({originator:"abc", creationDate: new Date}, function(err, data) {
        should(err).be.ok;
        data.should.have.property("fields");
        data.fields.should.containEql("sender");
        done();
      });
    });

    it ("should fail when missing creationDate", function(done) {
      letter.createLetter({originator:"abc", sender: "abc"}, function(err, data) {
        should(err).be.ok;
        data.should.have.property("fields");
        data.fields.should.containEql("creationDate");
        done();
      });
    });

    it ("should create an empty draft", function(done) {
      letter.createLetter({originator:"abc", sender: "abc", creationDate: new Date}, function(err, data) {
        should(err).not.be.ok;
        data.should.be.type("object");
        data.should.have.length(1);
        data[0].should.have.property("_id");
        done();
      });
    });
  });

  var letterData = [
    {
      operation: "manual-incoming",
      date: new Date,
      receivedDate: new Date,
      mailId: "123",
      incomingAgenda: "A123",
      recipient: "user1",
      sender: "user2",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },
    {
      operation: "manual-incoming",
      date: new Date,
      receivedDate: new Date,
      mailId: "123",
      incomingAgenda: "A123",
      recipient: "user1",
      ccList: "user3,user4",
      sender: "user2",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },
  ];

  describe("Letter[manual-incoming]", function() {
    it ("should fail on incomplete data: sender", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[0]);
        delete(d.sender);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          should(err).be.ok;
          data.should.have.property("success");
          data.should.have.property("fields");
          data.success.should.not.be.ok;
          data.fields.should.containEql("sender");
          done();
        });
      }

      letter.createLetter({originator:"abc", sender: "abc", creationDate: new Date}, check);
    });

    it ("should fail on invalid data: date", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[0]);
        d.date = new Date("a");

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          should(err).be.ok;
          data.should.have.property("success");
          data.should.have.property("fields");
          data.success.should.not.be.ok;
          data.fields.should.containEql("date");
          done();
        });
      }

      letter.createLetter({originator:"abc", sender: "abc", creationDate: new Date}, check);
    });

    it ("should fail on invalid data: receivedDate", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[0]);
        d.receivedDate = new Date("a");

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          should(err).be.ok;
          data.should.have.property("success");
          data.should.have.property("fields");
          data.success.should.not.be.ok;
          data.fields.should.containEql("receivedDate");
          done();
        });
      }

      letter.createLetter({originator:"abc", sender: "abc", creationDate: new Date}, check);
    });


    it ("should create an incoming letter", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[0]);
        d._id = data[0]._id;
        saveAttachment(d, function(record) {
          record.should.have.length(1);
          record[0].should.have.property("fileAttachments");
          record[0].fileAttachments.should.have.length(1);
          done();
        });
      }

      letter.createLetter({originator:"abc", sender: "abc", creationDate: new Date}, check);
    });

    it ("should create an incoming letter with cc", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[1]);
        d._id = data[0]._id;
        saveAttachment(d, function(record) {
          record.should.have.length(1);
          record[0].should.have.property("fileAttachments");
          record[0].fileAttachments.should.have.length(1);
          record[0].should.have.property("ccList");
          record[0].ccList.should.have.length(2);
          done();
        });
      }

      letter.createLetter({originator:"abc", sender: "abc", creationDate: new Date}, check);
    });

  });
});

describe("Letter Process", function() {
  before(function(done) {
    var orgs = [
      { name: "A", path: "A", head: "a" },
      { name: "B", path: "A;B", head: "b1" },
      { name: "C", path: "A;B;C", head: "c" },
      { name: "D", path: "D", head: "d" },
      { name: "Da", path: "D;DA", head: "da" },
      { name: "E", path: "E", head: "e" },
    ];
    var users = [
      { username: "a", org: "A" },
      { username: "b", org: "A;B" },
      { username: "b1", org: "A;B" },
      { username: "b2", org: "A;B" },
      { username: "b3", org: "A;B" },
      { username: "b4", org: "A;B" },
      { username: "tu.b", org: "A;B", roleList: [ utils.simaya.administrationRole ]},
      { username: "c", org: "A;B;C" },
      { username: "c1", org: "A;B;C" },
      { username: "d", org: "D" },
      { username: "d1", org: "D" },
      { username: "da", org: "D;DA" },
      { username: "tu.d", org: "D", roleList: [ utils.simaya.administrationRole ]},
      { username: "e", org: "E" },
      { username: "tu.e", org: "E", roleList: [ utils.simaya.administrationRole ]},
    ]
    async.series([
      function(cb) {
        clearUser(function(err, r) {
          cb(err, r);
        });
      },
      function(cb) {
        async.map(orgs, insertOrg, cb);
      },
      function(cb) {
        async.map(users, insertUser, cb);
      },
      ], function(e,v) {
        done();
      }
    );
  });

  describe("Get reviewer list by user", function() {
    it ("should return correct list", function(done) {
      letter.reviewerListByUser("c1", "a", function(data) {
        data.should.have.length(3);
        var names = _.pluck(data, "username"); 
        names.should.eql(["c", "b1", "a"]);
        done();
      });
    });

    it ("should also return correct list", function(done) {
      letter.reviewerListByUser("b", "a", function(data) {
        data.should.have.length(2);
        var names = _.pluck(data, "username"); 
        names.should.eql(["b1", "a"]);
        done();
      });
    });

    it ("should also return correct list again", function(done) {
      letter.reviewerListByUser("c1", "b", function(data) {
        data.should.have.length(2);
        var names = _.pluck(data, "username"); 
        names.should.eql(["c", "b1"]);
        done();
      });
    });

    it ("should also return correct list again", function(done) {
      letter.reviewerListByUser("c", "b", function(data) {
        data.should.have.length(1);
        var names = _.pluck(data, "username"); 
        names.should.eql(["b1"]);
        done();
      });
    });

     it ("should fail", function(done) {
      letter.reviewerListByUser("c1", "d", function(data) {
        data.should.have.length(0);
        done();
      });
    });

     it ("should fail again", function(done) {
      letter.reviewerListByUser("a", "c", function(data) {
        data.should.have.length(0);
        done();
      });
    });
  });

  var letterData = [
    {
      operation: "outgoing",
      date: new Date,
      recipients: "d",
      sender: "a",
      originator: "c",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },
    {
      operation: "outgoing",
      date: new Date,
      recipients: "d,e",
      sender: "a",
      originator: "c",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },
    {
      operation: "outgoing",
      date: new Date,
      recipients: "d,e",
      ccList: "b3,b4",
      sender: "a",
      originator: "c",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },
    {
      operation: "outgoing",
      date: new Date,
      recipients: "d",
      sender: "b1",
      originator: "c",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },

    {
      operation: "outgoing",
      date: new Date,
      recipients: "d,e",
      sender: "b1",
      originator: "c",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },

    {
      operation: "outgoing",
      date: new Date,
      recipients: "d,e",
      ccList: "b3",
      sender: "b1",
      originator: "c",
      title: "title",
      classification: "0",
      priority: "0",
      type: "11",
      comments: "comments"
    },



  ];

  describe("Letter[outgoing]", function() {
    it ("should fail on incomplete data: sender", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[0]);
        delete(d.sender);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          should(err).be.ok;
          data.should.have.property("success");
          data.should.have.property("fields");
          data.success.should.not.be.ok;
          data.fields.should.containEql("sender");
          done();
        });
      }

      letter.createLetter({originator:"abc", sender: "abc", creationDate: new Date}, check);
    });

    var id;
    it ("create outgoing letter", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[0]);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          data.should.have.length(1);
          data[0].should.have.property("_id");
          id = data[0]._id;
          data[0].should.have.property("reviewers");
          data[0].should.have.property("receivingOrganizations");
          data[0].should.have.property("currentReviewer");
          data[0].reviewers.should.be.eql(["b1", "a"]);
          data[0].currentReviewer.should.be.eql("b1");
          data[0].should.have.property("status");
          data[0].status.should.be.eql(2);
          done();
        });
      }

      letter.createLetter({originator:letterData[0].originator, sender: "abc", creationDate: new Date}, check);
    });

    it ("review outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("a");
        data[0].should.have.property("log");
        data[0].log.should.have.length(2);
        data[0].should.have.property("status");
        data[0].status.should.be.eql(2);
        data[0].comments.should.be.eql("commented");
        
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "b1", "approved", data, check);
    });

    it ("reject outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("log");
        data[0].log.should.have.length(3);
        data[0].should.have.property("status");
        data[0].status.should.be.eql(2);
        data[0].title.should.be.eql("changed");
        
        done();
      }

      var data = {
        message: "Not OK",
        title: "changed"
      };
      letter.reviewLetter(id, "a", "declined", data, check);
    });

    it ("reject outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("c");
        data[0].should.have.property("log");
        data[0].log.should.have.length(4);
        data[0].should.have.property("status");
        data[0].status.should.be.eql(2);
        data[0].recipients.should.be.eql(["e"]);
        
        done();
      }

      var data = {
        message: "Not OK",
        recipients: "e"
      };
      letter.reviewLetter(id, "b1", "declined", data, check);
    });

    it ("approve outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("log");
        data[0].log.should.have.length(5);
        data[0].should.have.property("status");
        data[0].status.should.be.eql(2);
        
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "c", "approved", data, check);
    });

    it ("approve outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("a");
        data[0].should.have.property("log");
        data[0].log.should.have.length(6);
        data[0].should.have.property("status");
        data[0].status.should.be.eql(2);
        
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "b1", "approved", data, check);
    });

    it ("finally approve outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("a");
        data[0].should.have.property("log");
        data[0].log.should.have.length(7);
        data[0].should.have.property("status");
        data[0].status.should.be.eql(3);
        
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "a", "approved", data, check);
    });

    var id;
    it ("create outgoing letter multiple recipients", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[1]);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          data.should.have.length(1);
          data[0].should.have.property("_id");
          id = data[0]._id;
          data[0].should.have.property("reviewers");
          data[0].should.have.property("receivingOrganizations");
          data[0].should.have.property("currentReviewer");
          data[0].reviewers.should.be.eql(["b1", "a"]);
          data[0].currentReviewer.should.be.eql("b1");
          data[0].should.have.property("status");
          data[0].status.should.be.eql(2);
          var orgs = Object.keys(data[0].receivingOrganizations);
          orgs.should.have.length(2);
          orgs.should.be.eql(["D", "E"]);
          done();
        });
      }

      letter.createLetter({originator:letterData[0].originator, sender: "abc", creationDate: new Date}, check);
    });

    var id;
    it ("create outgoing letter multiple recipients and ccList", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[2]);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          data.should.have.length(1);
          data[0].should.have.property("_id");
          id = data[0]._id;
          data[0].should.have.property("reviewers");
          data[0].should.have.property("receivingOrganizations");
          data[0].should.have.property("currentReviewer");
          data[0].reviewers.should.be.eql(["b1", "a"]);
          data[0].currentReviewer.should.be.eql("b1");
          data[0].should.have.property("status");
          data[0].status.should.be.eql(2);
          var orgs = Object.keys(data[0].receivingOrganizations);
          orgs.should.have.length(3);
          orgs.should.be.eql(["D", "E", "A;B"]);
          done();
        });
      }

      letter.createLetter({originator:letterData[0].originator, sender: "abc", creationDate: new Date}, check);
    });
  });
  describe("Letter[sending]", function() {
    var id;
    it ("create outgoing letter", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[3]);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          data.should.have.length(1);
          data[0].should.have.property("_id");
          id = data[0]._id;
          data[0].should.have.property("reviewers");
          data[0].should.have.property("receivingOrganizations");
          data[0].should.have.property("currentReviewer");
          data[0].reviewers.should.be.eql(["b1"]);
          data[0].currentReviewer.should.be.eql("b1");
          data[0].should.have.property("status");
          data[0].status.should.be.eql(2);
          done();
        });
      }

      letter.createLetter({originator:letterData[0].originator, sender: "abc", creationDate: new Date}, check);
    });

    it ("approve outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("status");
        data[0].status.should.be.eql(3);
        
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "b1", "approved", data, check);
    });

    it ("send outgoing letter, but forgot to include mailId", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        done();
      }

      var data = {
        outgoingAgenda: "o123",
      };
      letter.sendLetter(id, "tu.b", data, check);
    });

    it ("send outgoing letter, but forgot to include outgoingAgenda", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        done();
      }

      var data = {
        mailId: "123",
      };
      letter.sendLetter(id, "tu.b", data, check);
    });


    it ("send outgoing letter, but performed by unauthorized user", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("user is not authorized");
        done();
      }

      var data = {
        mailId: "123",
        outgoingAgenda: "o123",
      };
      letter.sendLetter(id, "b1", data, check);
    });


    it ("send outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("status");
        data[0].status.should.be.eql(letter.Stages.SENT);
        data[0].should.have.property("outgoingAgenda");
        data[0].should.have.property("mailId");
        data[0].outgoingAgenda.should.be.eql("o123");
        data[0].mailId.should.be.eql("123");
        done();
      }

      var data = {
        outgoingAgenda: "o123",
        mailId: "123"
      };
      letter.sendLetter(id, "tu.b", data, check);
    });

  });

  describe("Letter[receiving]", function() {
    var id;
    it ("create outgoing letter", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[3]);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          data.should.have.length(1);
          data[0].should.have.property("_id");
          id = data[0]._id;
          data[0].should.have.property("reviewers");
          data[0].should.have.property("receivingOrganizations");
          data[0].should.have.property("currentReviewer");
          data[0].reviewers.should.be.eql(["b1"]);
          data[0].currentReviewer.should.be.eql("b1");
          data[0].should.have.property("status");
          data[0].status.should.be.eql(2);
          done();
        });
      }

      letter.createLetter({originator:letterData[0].originator, sender: "abc", creationDate: new Date}, check);
    });

    it ("approve outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("status");
        data[0].status.should.be.eql(3);
        
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "b1", "approved", data, check);
    });

    it ("send outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("status");
        data[0].status.should.be.eql(letter.Stages.SENT);
        data[0].should.have.property("outgoingAgenda");
        data[0].should.have.property("mailId");
        data[0].outgoingAgenda.should.be.eql("o123");
        data[0].mailId.should.be.eql("123");
        done();
      }

      var data = {
        outgoingAgenda: "o123",
        mailId: "123"
      };
      letter.sendLetter(id, "tu.b", data, check);
    });

    it ("receive incoming letter from unauthorized user from other org", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("receiving organization mismatch");
        done();
      }

      var data = {
        incomingAgenda: "o123",
      };
      letter.receiveLetter(id, "tu.e", data, check);
    });

    it ("receive incoming letter from unauthorized user from inside org", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("user is not authorized");
        done();
      }

      var data = {
        incomingAgenda: "o123",
      };
      letter.receiveLetter(id, "d", data, check);
    });

    it ("receive incoming letter but forgot to specify incoming agenda", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("fields");
        data.fields.should.be.eql(["incomingAgenda"]);
        done();
      }

      var data = {
      };
      letter.receiveLetter(id, "tu.d", data, check);
    });
    it ("should receive incoming letter successfully", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("status");
        data[0].status.should.be.eql(letter.Stages.SENT);
        data[0].should.have.property("receivingOrganizations");
        var r = data[0].receivingOrganizations;
        r.should.have.property("D");
        r.D.should.have.property("agenda");
        r.D.should.have.property("status");
        r.D.agenda.should.be.eql("o123");
        r.D.status.should.be.eql(letter.Stages.RECEIVED);
        done();
      }

      var data = {
        incomingAgenda: "o123",
      };
      letter.receiveLetter(id, "tu.d", data, check);
    });


  });

  describe("Letter[rejecting]", function() {
    var id;
    it ("create outgoing letter", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[3]);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          data.should.have.length(1);
          data[0].should.have.property("_id");
          id = data[0]._id;
          data[0].should.have.property("reviewers");
          data[0].should.have.property("receivingOrganizations");
          data[0].should.have.property("currentReviewer");
          data[0].reviewers.should.be.eql(["b1"]);
          data[0].currentReviewer.should.be.eql("b1");
          data[0].should.have.property("status");
          data[0].status.should.be.eql(2);
          done();
        });
      }

      letter.createLetter({originator:letterData[0].originator, sender: "abc", creationDate: new Date}, check);
    });

    it ("approve outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("status");
        data[0].status.should.be.eql(3);
        
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "b1", "approved", data, check);
    });

    it ("send outgoing letter", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("reviewers");
        data[0].should.have.property("receivingOrganizations");
        data[0].should.have.property("currentReviewer");
        data[0].currentReviewer.should.be.eql("b1");
        data[0].should.have.property("status");
        data[0].status.should.be.eql(letter.Stages.SENT);
        data[0].should.have.property("outgoingAgenda");
        data[0].should.have.property("mailId");
        data[0].outgoingAgenda.should.be.eql("o123");
        data[0].mailId.should.be.eql("123");
        done();
      }

      var data = {
        outgoingAgenda: "o123",
        mailId: "123"
      };
      letter.sendLetter(id, "tu.b", data, check);
    });

    it ("reject incoming letter from unauthorized user from other org", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("receiving organization mismatch");
        done();
      }

      var data = {
        reason: "OK"
      };
      letter.rejectLetter(id, "tu.e", data, check);
    });

    it ("reject incoming letter from unauthorized user from inside org", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("user is not authorized");
        done();
      }

      var data = {
        reason: "OK"
      };
      letter.rejectLetter(id, "d", data, check);
    });

    it ("reject incoming letter but forgot to specify reason", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("fields");
        data.fields.should.be.eql(["reason"]);
        done();
      }

      var data = {
      };
      letter.rejectLetter(id, "tu.d", data, check);
    });
    it ("should reject incoming letter successfully", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("status");
        data[0].status.should.be.eql(letter.Stages.SENT);
        data[0].should.have.property("receivingOrganizations");
        var r = data[0].receivingOrganizations;
        r.should.have.property("D");
        r.D.should.not.have.property("agenda");
        r.D.should.have.property("status");
        r.D.status.should.be.eql(letter.Stages.REJECTED);
        r.D.should.have.property("rejectedBy");
        r.D.should.have.property("rejectionReason");
        r.D.rejectedBy.should.be.eql("tu.d");
        r.D.rejectionReason.should.be.eql("OK");
        done();
      }

      var data = {
        reason: "OK",
      };
      letter.rejectLetter(id, "tu.d", data, check);
    });


  });

  describe("Letter[read]", function() {
    var id;
    it ("create outgoing letter", function(done) {
      var check = function(err, data) {
        var d = _.clone(letterData[3]);

        letter.editLetter({_id: data[0]._id}, d, function(err, data) {
          id = data[0]._id;
          done();
        });
      }

      letter.createLetter({originator:letterData[0].originator, sender: "abc", creationDate: new Date}, check);
    });

    it ("approve outgoing letter", function(done) {
      var check = function(err, data) {
        done();
      }

      var data = {
        message: "OK",
        comments: "commented"
      };
      letter.reviewLetter(id, "b1", "approved", data, check);
    });

    it ("send outgoing letter", function(done) {
      var check = function(err, data) {
        done();
      }

      var data = {
        outgoingAgenda: "o123",
        mailId: "123"
      };
      letter.sendLetter(id, "tu.b", data, check);
    });

    it ("read incoming not yet accepted letter", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("not yet accepted");
        done();
      }

      letter.readLetter(id, "d", check);
    });

    it ("should receive incoming letter successfully", function(done) {
      var check = function(err, data) {
        done();
      }

      var data = {
        incomingAgenda: "o123",
      };
      letter.receiveLetter(id, "tu.d", data, check);
    });

    it ("read incoming letter from unauthorized user from other org", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("receiving organization mismatch");
        done();
      }

      letter.readLetter(id, "tu.e", check);
    });

    it ("read incoming letter from inside org", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("readStates");
        var r = data[0].readStates;
        r.should.have.property("others");
        r.others.should.have.property("d1");
        
        done();
      }

      letter.readLetter(id, "d1", check);
    });

    it ("read incoming letter from inside sub-org  ", function(done) {
      var check = function(err, data) {
        should(err).be.ok;
        data.should.have.property("reason");
        data.reason.should.be.eql("receiving organization mismatch");
        done();
      }

      letter.readLetter(id, "da", check);
    });

    it ("should read incoming letter successfully", function(done) {
      var check = function(err, data) {
        data.should.have.length(1);
        data[0].should.have.property("_id");
        id = data[0]._id;
        data[0].should.have.property("status");
        data[0].status.should.be.eql(letter.Stages.SENT);
        data[0].should.have.property("readStates");
        var r = data[0].readStates;
        r.should.have.property("recipients");
        r.recipients.should.have.property("d");
        r.recipients.d.should.be.type("object");
        var d = new Date(r.recipients.d);
        d.valueOf().should.not.be.NaN;

        data[0].should.have.property("receivingOrganizations");
        var r = data[0].receivingOrganizations;
        r.should.have.property("D");
        r.D.should.have.property("agenda");
        r.D.should.have.property("status");
        r.D.status.should.be.eql(letter.Stages.RECEIVED);
        done();
      }

      letter.readLetter(id, "d", check);
    });
  });
});



