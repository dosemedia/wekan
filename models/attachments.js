Attachments = new FS.Collection('attachments', {
  stores: [

    // XXX Add a new store for cover thumbnails so we don't load big images in
    // the general board view
    new FS.Store.GridFS('attachments'),
  ],
});

if (Meteor.isServer) {
  Attachments.allow({
    insert(userId, doc) {
      return allowIsBoardMember(userId, Boards.findOne(doc.boardId));
    },
    update(userId, doc) {
      return allowIsBoardMember(userId, Boards.findOne(doc.boardId));
    },
    remove(userId, doc) {
      return allowIsBoardMember(userId, Boards.findOne(doc.boardId));
    },
    // We authorize the attachment download either:
    // - if the board is public, everyone (even unconnected) can download it
    // - if the board is private, only board members can download it
    download(userId, doc) {
      const board = Boards.findOne(doc.boardId);
      if (board.isPublic()) {
        return true;
      } else {
        return board.hasMember(userId);
      }
    },

    fetch: ['boardId'],
  });
}

// XXX Enforce a schema for the Attachments CollectionFS

Attachments.files.before.insert((userId, doc) => {
  const file = new FS.File(doc);
  doc.userId = userId;

  // If the uploaded document is not an image we need to enforce browser
  // download instead of execution. This is particularly important for HTML
  // files that the browser will just execute if we don't serve them with the
  // appropriate `application/octet-stream` MIME header which can lead to user
  // data leaks. I imagine other formats (like PDF) can also be attack vectors.
  // See https://github.com/wekan/wekan/issues/99
  // XXX Should we use `beforeWrite` option of CollectionFS instead of
  // collection-hooks?
  if (!file.isImage()) {
    file.original.type = 'application/octet-stream';
  }
});

if (Meteor.isServer) {
  Attachments.files.after.insert((userId, doc) => {
    Activities.insert({
      userId,
      type: 'card',
      activityType: 'addAttachment',
      attachmentId: doc._id,
      boardId: doc.boardId,
      cardId: doc.cardId,
    });
  });

  Attachments.files.after.remove((userId, doc) => {
    Activities.remove({
      attachmentId: doc._id,
    });
  });
}


//ATTACHMENTS REST API
if (Meteor.isServer) {
  JsonRoutes.add('POST', '/api/boards/:boardId/lists/:listId/cards/:cardId/cover', function (req, res, next) {
    
    Authentication.checkUserId(req.userId);
    
    const paramBoardId = req.params.boardId;
    const paramListId = req.params.listId;
    const paramCardId = req.params.cardId;
    
    Authentication.checkBoardAccess(req.userId, paramBoardId);
    
    // Make sure card is found
    var card = Cards.findOne({_id: paramCardId, listId: paramListId, boardId: paramBoardId, archived: false});
    if(!card) {
      return JsonRoutes.sendResult(res, {
        code: 404,
        data: {},
      });
    }
    
    var filedata = req.body;
    
    // Make sure file is an image
    if((filedata.type != "image/jpeg") && (filedata.type != "image/png")) {
      return JsonRoutes.sendResult(res, {
        code: 500,
        data: {error: "File must be an image"},
      });
    }
    
    // https://github.com/CollectionFS/Meteor-CollectionFS/blob/devel/packages/file/api.md
    const file = new FS.File();
    file.type(filedata.type);
    file.name(filedata.name);
    file.attachData(Buffer.from(filedata.base64, 'base64'), {type: filedata.type});
    file.boardId = paramBoardId;
    file.cardId = paramCardId;
    
    if(filedata["authorId"]) {
      file.userId = filedata["authorId"];
    }

    Attachments.insert(file, function (err, fileObj) {
      
      if(err) {
        
        console.error("Attachment insert error!", err)
        return JsonRoutes.sendResult(res, {
          code: 500,
          data: {error: err.message},
        });
      }
      
      // Attachment file has been created
      
      // Update card with new cover
      Cards.direct.update({_id: paramCardId, listId: paramListId, boardId: paramBoardId, archived: false},
                {$set: {coverId: fileObj._id}});
                
      // Fetch new copy of card
      card = Cards.findOne({_id: paramCardId, listId: paramListId, boardId: paramBoardId, archived: false});
      
      JsonRoutes.sendResult(res, {
        code: 200,
        data: card,
      });
      
    });
    
  });
}
