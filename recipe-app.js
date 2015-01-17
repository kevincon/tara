if (Meteor.isClient) {
  Session.setDefault("currentInstruction", 1); // indexed by 1
  Session.setDefault("recipe", {});

  Meteor.call("getRecipe", function(error, result) {
    Session.set("recipe", result);
  });

  Template.title.helpers({
    title: function() {
      return Session.get("recipe").title;
    },
    image: function() {
      var recipe = Session.get("recipe");
      if (recipe) {
        var imageUrls = recipe.imageUrls;
        if (imageUrls.length > 0) {
          return {"key": 0, "value": imageUrls[0]};
        } else {
          // TODO return placeholder image instead of null
          return {"key": 0, "value": null};
        }
      } else {
        return {"key": 0, "value": null};
      }
    }
  });

  Template.ingredients.helpers({
    ingredients: function() {
      return Session.get("recipe").extendedIngredients;
    }
  });

  Template.ingredient.events({
    "click tr": function() {
      speak(this.originalString);
    }
  });

  Template.registerHelper("arrayify", function(theArray, offset) {
    resultingArray = [];
    for (var i = 0; i < theArray.length; i++) {
      resultingArray.push({"key": i + offset, "value": theArray[i]});
    }
    return resultingArray;
  });

  Template.instructions.helpers({
    instructions: function() {
      var bigInstructionText = Session.get("recipe").text;
      return bigInstructionText.split(/\.\s/);
    }
  });

  Template.instruction.helpers({
    isCurrentInstruction: function(key) {
      return key == Session.get("currentInstruction");
    }
  });

  Template.instruction.events({
    "click tr": function() {
      Session.set("currentInstruction", this.key);
      speak(this.value);
    }
  });

  function speak(text) {
    Meteor.call("getSpeechURL", text, function(error, result) {
      var speech = new buzz.sound(result);
      speech.play();
    });
  }
}

if (Meteor.isServer) {
  Meteor.methods({
    getRecipe: function() {
      return EJSON.parse(Assets.getText("recipe.json"));
    },
    getSpeechURL: function(text) {
      var options = {"apikey": Meteor.settings.ISPEECH_API_KEY,
                   "action": "convert",
                   "voice": "ukenglishfemale",
                   "text": text};

      var speechURL = "https://api.ispeech.org/api/rest?";
      for (option in options) {
        speechURL += option + "=" + options[option] + "&";
      }
      return speechURL;
    }
  });
}
