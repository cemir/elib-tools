var fs = require('fs');
var mongodb = require('mongodb');
var mongo = require('mongodb').MongoClient;
var Binary = require('mongodb').Binary;
var ObjectID = require('mongodb').ObjectID;
const fileType = require('file-type');
var htmlToText = require('html-to-text');

var calibraryPath = '/applications/calibre/calibrary';

// Formats to convert from by preference :
// LIT, MOBI, AZW, EPUB, AZW3, FB2, DOCX, HTML, PRC, ODT, RTF, PDB, TXT, PDF
//

mongo.connect('mongodb://localhost:27017/elib', function(err, db) {
  if(err) console.log(err);
  console.log("Connected");

  var bucket = new mongodb.GridFSBucket(db);

  db.collection('library').remove({}, {}, function(err, numberOfRemovedDocs) {if(err) console.log(err)});
  db.collection('cover').remove({}, {}, function(err, numberOfRemovedDocs) {if(err) console.log(err)});
  db.collection('fs.chunks').remove({}, {}, function(err, numberOfRemovedDocs) {if(err) console.log(err)});
  db.collection('fs.files').remove({}, {}, function(err, numberOfRemovedDocs) {if(err) console.log(err)});

  db.collection('calibrary').find().limit(5).each(function(err, doc){
    if(err || !doc) {
      console.log(err);
      return;
    }
    // Load and rename the file formats, accepts only epub mobi and pdf for now.
    // file extension is used to determine the file type but this should be improved
    if(doc.formats){
      doc.files = [];
      for(var i = 0, len = doc.formats.length; i<len; i++){
         var docuFile = fs.readFileSync(doc.formats[i]);
         var fileFormat = fileType(docuFile);
         var tmpFormatsArray = [];
         if (fileFormat){
           if (fileFormat.ext == 'pdf' || fileFormat.ext == 'epub'){ // TODO review condition to use MIME type
             fileFormat.name = doc.authors + '-' + doc.title;
             var uploadStream = bucket.openUploadStream(fileFormat.name); 
             fileFormat.id = uploadStream.id;
             uploadStream.write(docuFile);
             uploadStream.end();
             // TODO better logging
             console.log("Import : " + fileFormat.ext);
             console.log(fileFormat); 
             doc.files.push(fileFormat);
           } else {
             // TODO manage and log not imported file -> cause not supported format
             console.log("do not import : " + fileFormat.ext);
           }
         } else {
           // TODO manage and log not imported files
         }
      }
      //doc.formats = tmpFormatsArray;
    }else {
      console.log("no file found for : " + doc.title );
    }

    // Convert some tags to vlibs
    doc.vlibs = [];
    for (var i = 0, len = doc.tags.length; i < len; i++){
       if ( doc.tags[i] == 'METS_TO_UPDATE'){ doc.vlibs.push('METS_TO_UPDATE')};
       if ( doc.tags[i] == 'it-books'){ doc.vlibs.push('it-books')};
    }

    // Import comment to synopsis
    doc.synopsis = htmlToText.fromString(doc.comments,{'preserveNewlines':true});

    // Add cover to 'covers' collection and replace cover in JSON by new ObjectID
    if(doc.cover){
      var cover = {};
      cover._id = new ObjectID();
      cover.data = fs.readFileSync(doc.cover);
      cover.contentType = "image/jpeg";
      db.collection('covers').insert(cover, function(err,doc){if(err) console.log(err)});
      doc.cover = cover._id;
    } else {
      // TODO better handling if no cover
      doc.cover = null;
      console.log ("No path found, trying to dump doc ");
      if (doc) {
       console.log(doc.title); 
      }
    }

    // Some cleaning
    delete doc.comments;
    delete doc.id;

    // Add an ID and import to new collection
    doc._id = new ObjectID(); 
    db.collection('library').insert(doc,function(err,doc){if(err) console.log(err)});

  }); 
});
