if (Meteor.isClient) {
  Session.setDefault("currentInstruction", 1); // indexed by 1
  Session.setDefault("recipe", {});

  Meteor.call("getTestRecipe", function(error, result) {
    Session.set("recipe", result);
  });

  Template.recipeurl.events = {
    // If the enter key is pressed in the recipe URL input box, load the url.
    'keypress input.recipeurl': function (event, template) {
      if (event.which === 13) {  // Enter key pressed
        var url = template.find(".recipeurl").value;
        if (!url || url.length === 0) { return; }

        console.debug("Loading new recipe from URL: " + url);
        Meteor.call("getRecipe", url, function(error, result) {
          if (result === undefined || result === null) {
            console.debug("Result is bad :(");
          } else {
            console.debug("Result is good :)");
            console.debug("Stringified recipe: " + EJSON.stringify(result));
            Session.set("recipe", result);
          }
        });
      }
    }
  };

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
    getTestRecipe: function() {
      return EJSON.parse(Assets.getText("recipe.json"));
    },
    getRecipe: function(recipeUrl) {
      //? this.unblock
      var endpoint = "https://webknox-recipes.p.mashape.com/recipes/extract";
      var params = {"url": recipeUrl};
      var headers = {"X-Mashape-Key": Meteor.settings.WEBKNOX_API_KEY,
                     "Accept": "application/json"};

      try {
        var result = Meteor.http.call("GET", endpoint, {params: params, headers: headers});
        return EJSON.parse(result.content);
      } catch (e) {
        console.log("Cannot get recipe from URL", e);
        return null;
      }
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
